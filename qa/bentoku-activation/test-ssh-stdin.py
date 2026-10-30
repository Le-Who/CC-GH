import base64,contextlib,hashlib,importlib.util,io,json,os,pathlib,subprocess,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('ssh_stdin',ROOT/'ssh-stdin.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
TOKEN='SYNTHETIC_TOKEN_CANARY_01234567890'
KEY='SYNTHETIC_EXISTING_SSH_KEY_CANARY'
TRANSPORT=(ROOT/'transport.sh').read_bytes()
KEY_BYTES=b'only a synthetic public key for local mocking'
KEY_ENCODED=base64.b64encode(KEY_BYTES).decode()
PIN='SHA256:'+base64.b64encode(hashlib.sha256(KEY_BYTES).digest()).decode().rstrip('=')
SCAN=('fixture.example ssh-ed25519 '+KEY_ENCODED+'\n').encode()
ENV={'PATH':os.environ['PATH'],'HOME':os.environ['HOME'],'VPS_HOST':'fixture.example','VPS_PORT':'2222','VPS_USERNAME':'root','VPS_SSH_KEY':KEY,'YARD_GHCR_TOKEN':TOKEN,'YARD_GHCR_USER':'fixture-user'}
SUCCESS=json.dumps({'format':'cc-gh-yard-activation-transport/v1','workerTerminal':True,'stage':'helper_completed','exitCode':0,'helperSucceeded':True,'recordSha256':mod.RECORD}).encode()
class Agent:
 def __init__(self,args,**kwargs):
  assert all(TOKEN not in x and KEY not in x for x in args); assert 'VPS_SSH_KEY' not in kwargs['env']; self.socket=pathlib.Path(args[-1]); self.socket.touch(); self.terminated=False
 def poll(self):return None
 def terminate(self):self.terminated=True
 def wait(self,timeout=None):return 0
 def kill(self):self.terminated=True
class TestSSH(unittest.TestCase):
 def exercise(self,mode):
  calls=[]; agents=[]
  def run(args,**kwargs):
   calls.append(args[0]);self.assertFalse(any(TOKEN in x or KEY in x for x in args));self.assertNotIn('YARD_GHCR_TOKEN',kwargs['env']);self.assertNotIn('VPS_SSH_KEY',kwargs['env'])
   if args[0]=='ssh-keyscan': return subprocess.CompletedProcess(args,0,SCAN if mode!='host-mismatch' else b'')
   if args[0]=='ssh-add': self.assertEqual(kwargs['input'],KEY.encode()+b'\n');return subprocess.CompletedProcess(args,1 if mode=='key-fail' else 0,stderr=b'')
   if args[0]=='ssh':
    for option in ('StrictHostKeyChecking=yes','HostKeyAlgorithms=ssh-ed25519','BatchMode=yes','GlobalKnownHostsFile=/dev/null','IdentityFile=none','ForwardAgent=no'):self.assertIn(option,args)
    self.assertEqual(args[-1],mod.REMOTE_COMMAND);self.assertEqual(kwargs['input'],TOKEN.encode()+b'\nfixture-user\n'+TRANSPORT)
    if mode=='timeout': raise subprocess.TimeoutExpired(args,540)
    if mode=='interrupt': mod.signal.raise_signal(mod.signal.SIGTERM)
    payload=TOKEN.encode() if mode=='secret-output' else b'{}' if mode=='missing-success' else SUCCESS.replace(b'helper_completed',b'release_helper') if mode=='false-success' else SUCCESS.replace(mod.RECORD.encode(),b'0'*64) if mode=='foreign-success' else SUCCESS
    return subprocess.CompletedProcess(args,0,payload)
   raise AssertionError(args)
  def agent(*args,**kwargs):a=Agent(*args,**kwargs);agents.append(a);return a
  out=io.StringIO()
  with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{**ENV,'RUNNER_TEMP':tmp},clear=True),patch.object(mod,'FINGERPRINT',PIN),patch.object(mod.sys,'argv',['ssh-stdin.py',str(ROOT/'transport.sh')]),patch.object(mod.subprocess,'run',run),patch.object(mod.subprocess,'Popen',agent),contextlib.redirect_stdout(out):
   rc=mod.main(); self.assertEqual(list(pathlib.Path(tmp).iterdir()),[])
  self.assertTrue(all(a.terminated for a in agents));self.assertNotIn(TOKEN,out.getvalue());self.assertNotIn(KEY,out.getvalue());return rc,calls,out.getvalue()
 def test_success(self):self.assertEqual(self.exercise('success')[0],0)
 def test_mismatch_before_key_or_ssh(self):rc,calls,_=self.exercise('host-mismatch');self.assertEqual(rc,70);self.assertEqual(calls,['ssh-keyscan'])
 def test_key_rejected_without_ssh(self):rc,calls,_=self.exercise('key-fail');self.assertEqual(rc,70);self.assertNotIn('ssh',calls)
 def test_timeout_cleanup_no_retry(self):rc,calls,_=self.exercise('timeout');self.assertEqual(rc,70);self.assertEqual(calls.count('ssh'),1)
 def test_unexpected_secret_output_suppressed(self):self.assertEqual(self.exercise('secret-output')[0],70)
 def test_interrupt_cleans_without_retry(self):rc,calls,_=self.exercise('interrupt');self.assertEqual(rc,70);self.assertEqual(calls.count('ssh'),1)
 def test_no_false_or_foreign_terminal_success(self):
  for mode in ('missing-success','false-success','foreign-success'):
   with self.subTest(mode=mode):
    rc,calls,_=self.exercise(mode);self.assertEqual(rc,70);self.assertEqual(calls.count('ssh'),1)
 def test_evidence_directory_allowlist_is_exact_new_stage(self):
  prefix='/opt/game-hub/releases/yard-development-'+mod.RECORD
  for directory,expected in ((prefix,1),(prefix+'-retry1',0),(prefix+'/other',0)):
   out=io.StringIO()
   with contextlib.redirect_stdout(out):
    rows=mod.public_output(json.dumps({'format':'cc-gh-yard-activation-transport/v1','recordSha256':mod.RECORD,'evidenceDirectory':directory}).encode(),TOKEN)
   self.assertEqual(len(rows),expected)
 def test_token_shape_rejected(self):
  with self.assertRaises(mod.Blocked):mod.validated_inputs({**ENV,'YARD_GHCR_TOKEN':TOKEN+'\n'},TRANSPORT)
 def test_opaque_stateless_token_exact_bytes(self):
  opaque='ghs_12345_'+('aB-_'*150)+'.'+('Z_'*90)+'.signature'
  with patch.dict(ENV,{'YARD_GHCR_TOKEN':opaque}),patch.dict(globals(),{'TOKEN':opaque}):
   self.assertEqual(self.exercise('success')[0],0)
 def test_control_bytes_rejected(self):
  for control in ('\n','\r','\0','\t','\x1b','\x7f'):
   with self.subTest(control=repr(control)),self.assertRaises(mod.Blocked):mod.validated_inputs({**ENV,'YARD_GHCR_TOKEN':TOKEN+control},TRANSPORT)
 def test_oversized_token_rejected(self):
  with self.assertRaises(mod.Blocked):mod.validated_inputs({**ENV,'YARD_GHCR_TOKEN':'x'*16385},TRANSPORT)
 def test_key_terminal_newline_only(self):
  for key in ('fixture', 'fixture\n', 'fixture\n\n', 'fixture\r\n'):
   expected=key.encode()+(b'' if key.endswith('\n') else b'\n')
   self.assertEqual(mod.key_stdin(key),expected)
 def test_empty_token_rejected(self):
  with self.assertRaises(mod.Blocked):mod.validated_inputs({**ENV,'YARD_GHCR_TOKEN':''},TRANSPORT)
 def test_exact_transport_pin(self):
  with self.assertRaises(mod.Blocked):mod.validated_inputs(ENV,TRANSPORT+b'\n')
 def test_output_drops_arbitrary_content(self):
  out=io.StringIO()
  with contextlib.redirect_stdout(out):mod.public_output(b'banner\n'+json.dumps({'format':'cc-gh-yard-activation-transport/v1','recordSha256':mod.RECORD,'stage':['bad']}).encode(),TOKEN)
  self.assertEqual(out.getvalue(),'')
 def test_actual_remote_shell_uses_stdin_not_argv(self):
  script=b'''set -eu\n[ "$YARD_GHCR_TOKEN" = SYNTHETIC_TOKEN_CANARY_01234567890 ]\npython3 - <<'CHECK'\nimport os,pathlib\npid=os.getpid()\nfor i in range(3):\n data=pathlib.Path('/proc/'+str(pid)+'/cmdline').read_bytes()\n assert b'SYNTHETIC_TOKEN_CANARY_01234567890' not in data\n pid=int(pathlib.Path('/proc/'+str(pid)+'/stat').read_text().split()[3])\nprint('stdin-and-argv-boundary-passed')\nCHECK\n'''
  r=subprocess.run(['/bin/bash','-c',mod.REMOTE_COMMAND],input=TOKEN.encode()+b'\nfixture-user\n'+script,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5,env={'PATH':os.environ['PATH']})
  self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout,b'stdin-and-argv-boundary-passed\n')
if __name__=='__main__':unittest.main(verbosity=2)
