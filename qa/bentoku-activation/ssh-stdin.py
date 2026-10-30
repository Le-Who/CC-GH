#!/usr/bin/env python3
"""One pinned SSH connection, existing key in memory, secret only on stdin."""
import base64, hashlib, json, os, pathlib, re, signal, subprocess, sys, tempfile, time

FINGERPRINT = 'SHA256:nmCEFSmxSk18WJxilFcWnHnsDT3Fwo/DUEYuoXjlcpU'
TRANSPORT_SHA256 = '3096ea528f64ff54c1d51f691ef72923d2136d659acab67396351143b2d2d89b'
RECORD = '8af3bf5634ea22c7a05b27d32bb8ced8424ce239b887e47f0f8fcf8a06c3907a'
REMOTE_COMMAND = "bash -c 'set +x; set -euo pipefail; IFS= read -r YARD_GHCR_TOKEN; IFS= read -r YARD_GHCR_USER; export YARD_GHCR_TOKEN YARD_GHCR_USER; exec bash -s'"

class Blocked(Exception):
    pass

def pinned_host_key(scan, host, port):
    matches = set()
    for line in scan.decode('ascii').splitlines():
        fields = line.split()
        if len(fields) != 3 or fields[1] != 'ssh-ed25519':
            continue
        try:
            key = base64.b64decode(fields[2], validate=True)
        except ValueError:
            continue
        digest = 'SHA256:' + base64.b64encode(hashlib.sha256(key).digest()).decode().rstrip('=')
        if digest == FINGERPRINT:
            # Construct the lookup target ourselves; never trust scan's host field.
            lookup = host if port == '22' else '[' + host + ']:' + port
            matches.add(lookup + ' ssh-ed25519 ' + fields[2] + '\n')
    if len(matches) != 1:
        raise Blocked('host_key_mismatch')
    return matches.pop()

def validated_inputs(environ, transport):
    host = environ.get('VPS_HOST', '')
    port = environ.get('VPS_PORT', '22') or '22'
    user = environ.get('VPS_USERNAME', '')
    actor = environ.get('YARD_GHCR_USER', '')
    token = environ.get('YARD_GHCR_TOKEN', '')
    key = environ.get('VPS_SSH_KEY', '')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]{0,252}', host): raise Blocked('invalid_host')
    if not re.fullmatch(r'[0-9]{1,5}', port) or not 1 <= int(port) <= 65535: raise Blocked('invalid_port')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,63}', user): raise Blocked('invalid_user')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}(\[bot\])?', actor): raise Blocked('invalid_actor')
    if not token or len(token.encode('utf-8')) > 16384 or any(ord(c) < 32 or ord(c) == 127 for c in token): raise Blocked('invalid_token_shape')
    if not key or len(key) > 32768: raise Blocked('missing_key')
    if hashlib.sha256(transport).hexdigest() != TRANSPORT_SHA256: raise Blocked('transport_hash_mismatch')
    return host, port, user, actor, token, key

def public_output(data, token):
    # Drop unstructured banners and stderr. Never relay arbitrary remote strings.
    if token.encode() in data: raise Blocked('unexpected_secret_output')
    records = []
    capacity = {'runtimePinsVerified','databaseSizeBytes','backupAvailableKiB','dockerAvailableKiB','requiredBackupKiB','protectedReserveKiB','candidatePullAllowanceKiB','capacityPassed'}
    allowed = {'format','workerLaunched','failedStage','recordSha256','evidenceDirectory','workerTerminal','stage','exitCode','helperSucceeded','outcome','deadlineExitCode','registryCleanupSucceeded'}
    for line in data.splitlines():
        try: row = json.loads(line)
        except (ValueError, UnicodeError): continue
        if not isinstance(row, dict): continue
        if set(row) == capacity and all(type(v) in (bool,int) for v in row.values()):
            records.append(row); continue
        if not set(row) <= allowed or row.get('format') != 'cc-gh-yard-activation-transport/v1' or row.get('recordSha256') != RECORD: continue
        string_values = {'format': {'cc-gh-yard-activation-transport/v1'}, 'recordSha256': {RECORD}, 'evidenceDirectory': {'/opt/game-hub/releases/yard-development-' + RECORD}, 'outcome': {'unverified'}, 'stage': {'transport_checks','image_availability','environment_gate','release_helper','helper_completed'}, 'failedStage': {'initial_guards','runtime_pins','exclusive_staging','packet_integrity'}}
        if any((k in string_values and (not isinstance(v,str) or v not in string_values[k])) or (k not in string_values and type(v) not in (int,bool)) for k,v in row.items()): continue
        records.append(row)
    for row in records: print(json.dumps(row, separators=(',', ':')), flush=True)
    return records

def key_stdin(key):
    # OpenSSH's PEM reader requires the closing line to terminate; keep all
    # existing bytes and append only the missing serialization newline.
    encoded = key.encode('utf-8')
    return encoded if encoded.endswith(b'\n') else encoded + b'\n'

def main():
    stage = 'runner_inputs'; agent = None; private = None
    def interrupted(signum, frame): raise Blocked('interrupted')
    prior_term = signal.signal(signal.SIGTERM, interrupted)
    prior_int = signal.signal(signal.SIGINT, interrupted)
    try:
        if len(sys.argv) != 2: raise Blocked('usage')
        transport = pathlib.Path(sys.argv[1]).read_bytes()
        host, port, user, actor, token, key = validated_inputs(os.environ, transport)
        # No child inherits runner's GitHub token or SSH private-key environment.
        env = {'PATH': os.environ['PATH'], 'HOME': os.environ.get('HOME', '/tmp'), 'LC_ALL': 'C'}
        for name in ('VPS_SSH_KEY','YARD_GHCR_TOKEN','YARD_GHCR_USER'): os.environ.pop(name, None)
        stage = 'host_key_verification'
        scan = subprocess.run(['ssh-keyscan','-T','10','-p',port,'-t','ed25519',host],env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=15,check=False)
        known_host = pinned_host_key(scan.stdout,host,port)
        print('{"sshHostKeyVerified":true,"algorithm":"ssh-ed25519"}',flush=True)
        stage = 'ephemeral_agent'
        private = tempfile.TemporaryDirectory(prefix='yard-ssh-',dir=os.environ.get('RUNNER_TEMP'))
        directory = pathlib.Path(private.name); directory.chmod(0o700)
        known = directory/'known_hosts'; known.write_text(known_host); known.chmod(0o600)
        agent_socket = directory/'agent.sock'; env['SSH_AUTH_SOCK'] = str(agent_socket)
        agent = subprocess.Popen(['ssh-agent','-D','-a',str(agent_socket)],env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        deadline = time.monotonic()+5
        while not agent_socket.exists():
            if agent.poll() is not None or time.monotonic() >= deadline: raise Blocked('agent_start_failed')
            time.sleep(0.02)
        added = subprocess.run(['ssh-add','-'],input=key_stdin(key),env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=10,check=False)
        key = ''
        if added.returncode:
            if b'error in libcrypto' in added.stderr or b'invalid format' in added.stderr: raise Blocked('existing_key_parse_rejected')
            if b'Error connecting to agent' in added.stderr or b'Could not open a connection' in added.stderr: raise Blocked('existing_key_agent_unavailable')
            raise Blocked('existing_key_rejected')
        stage = 'ssh_stdin_transport'
        args = ['ssh','-F','/dev/null','-T','-p',port,'-o','BatchMode=yes','-o','ConnectTimeout=30','-o','ConnectionAttempts=1','-o','StrictHostKeyChecking=yes','-o','HostKeyAlgorithms=ssh-ed25519','-o','UserKnownHostsFile='+str(known),'-o','GlobalKnownHostsFile=/dev/null','-o','UpdateHostKeys=no','-o','PasswordAuthentication=no','-o','KbdInteractiveAuthentication=no','-o','PreferredAuthentications=publickey','-o','GSSAPIAuthentication=no','-o','IdentitiesOnly=no','-o','ForwardAgent=no','-o','ClearAllForwardings=yes','-o','IdentityFile=none','-o','LogLevel=ERROR',user+'@'+host,REMOTE_COMMAND]
        payload = token.encode()+b'\n'+actor.encode()+b'\n'+transport
        result = subprocess.run(args,input=payload,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=540,check=False)
        rows = public_output(result.stdout,token)
        if result.returncode == 0 and not any(r.get('helperSucceeded') is True and r.get('workerTerminal') is True and r.get('stage') == 'helper_completed' and r.get('exitCode') == 0 for r in rows): raise Blocked('missing_success_record')
        return result.returncode if result.returncode >= 0 else 70
    except (Blocked, OSError, ValueError, subprocess.TimeoutExpired) as error:
        # Never print exception text, command input, credentials, or raw SSH stderr.
        safe_reasons = {'usage','invalid_host','invalid_port','invalid_user','invalid_actor','invalid_token_shape','missing_key','transport_hash_mismatch','host_key_mismatch','agent_start_failed','existing_key_rejected','existing_key_parse_rejected','existing_key_agent_unavailable','unexpected_secret_output','missing_success_record','interrupted'}
        reason = str(error) if isinstance(error,Blocked) and str(error) in safe_reasons else 'runtime_error'
        print(json.dumps({'sshTransportVerified':False,'failedStage':stage,'reason':reason,'outcome':'unverified'},separators=(',',':')),flush=True)
        return 70
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        if agent is not None:
            agent.terminate()
            try: agent.wait(timeout=5)
            except subprocess.TimeoutExpired:
                agent.kill(); agent.wait()
        if private is not None: private.cleanup()
        signal.signal(signal.SIGTERM, prior_term)
        signal.signal(signal.SIGINT, prior_int)

if __name__ == '__main__': sys.exit(main())
