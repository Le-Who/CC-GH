#!/usr/bin/env python3
"""Actual Compose hash probe using only synthetic files and `config --hash app`.
No daemon, containers, registry, network, host access, or real environment values.
"""
import hashlib,json,os,pathlib,re,subprocess,tempfile

BASE='''services:
  app:
    image: registry.invalid/ccgh-synthetic:base
    env_file:
      - .env
    environment:
      NODE_ENV: production
      APP_BUILD_ID: ${APP_BUILD_ID}
      UNRELATED_SETTING: ${UNRELATED_SETTING}
    ports:
      - "127.0.0.1:${APP_HOST_PORT}:8080"
    restart: unless-stopped
'''
ENV='APP_BUILD_ID='+('e'*40)+'\nUNRELATED_SETTING=synthetic-original\nAPP_HOST_PORT=18080\n'
PRIOR_DIGEST='registry.invalid/ccgh-synthetic@sha256:'+('a'*64)
PRIOR_ID='sha256:'+('b'*64)
PRIOR_COMMIT='c'*40

def main():
 with tempfile.TemporaryDirectory(prefix='ccgh-compose-synthetic-') as directory:
  root=pathlib.Path(directory);(root/'home').mkdir();(root/'docker-config').mkdir()
  (root/'base.yml').write_text(BASE);(root/'.env').write_text(ENV)
  prior={'services':{'app':{'image':PRIOR_DIGEST,'environment':{'APP_BUILD_ID':PRIOR_COMMIT}}}}
  # A prior successful candidate and a fresh reconstruction have different file
  # identities/formatting but exactly the same effective service configuration.
  (root/'prior-candidate.json').write_text(json.dumps(prior)+'\n')
  (root/'predecessor.json').write_text(json.dumps(prior,indent=2)+'\n')
  by_id={'services':{'app':{'image':PRIOR_ID,'environment':{'APP_BUILD_ID':PRIOR_COMMIT}}}}
  (root/'predecessor-id.json').write_text(json.dumps(by_id)+'\n')
  # Empty client home/config and a nonexistent local socket prevent accidental
  # use of saved registry credentials, external contexts, or any running daemon.
  env={'PATH':os.environ['PATH'],'HOME':str(root/'home'),'DOCKER_CONFIG':str(root/'docker-config'),'DOCKER_HOST':'unix://'+str(root/'no-daemon.sock'),'LC_ALL':'C'}
  def service_hash(label,override=None):
   args=['docker','compose','-p','ccgh-config-probe','--env-file',str(root/'.env'),'-f',str(root/'base.yml')]
   if override:args+=['-f',str(root/override)]
   args+=['config','--hash','app']
   result=subprocess.run(args,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=20,check=False)
   if result.returncode:raise RuntimeError('Compose config probe failed: '+label+' (exit '+str(result.returncode)+')')
   match=re.fullmatch(r'app ([a-f0-9]{64})\n?',result.stdout)
   if not match:raise RuntimeError('Unexpected Compose config hash shape: '+label)
   return match.group(1)
  hashes={}
  hashes['priorCandidate']=service_hash('prior candidate','prior-candidate.json')
  hashes['reconstructedPredecessor']=service_hash('reconstructed predecessor','predecessor.json')
  hashes['bareBase']=service_hash('bare base')
  hashes['imageIdOverride']=service_hash('image-ID override','predecessor-id.json')
  (root/'.env').write_text(ENV.replace('synthetic-original','synthetic-drift'))
  hashes['unrelatedEnvironmentDrift']=service_hash('unrelated environment drift','predecessor.json')
  (root/'.env').write_text(ENV.replace('18080','18081'))
  hashes['portDrift']=service_hash('port drift','predecessor.json')
  expected=hashes['priorCandidate']
  if hashes['reconstructedPredecessor']!=expected:raise RuntimeError('Exact digest predecessor reconstruction differs')
  for case in ('bareBase','imageIdOverride','unrelatedEnvironmentDrift','portDrift'):
   if hashes[case]==expected:raise RuntimeError('Configuration drift was not rejected: '+case)
  print(json.dumps({'format':'cc-gh-synthetic-repeat-release-compose-probe/v1','syntheticOnly':True,'daemonContactAttempted':False,'containerOperations':0,'composeCommands':'config --hash app only','hashes':hashes,'sameEffectivePredecessor':True,'bareBaseRejected':True,'imageIdFormRejected':True,'unrelatedEnvironmentDriftRejected':True,'portDriftRejected':True},sort_keys=True))

if __name__=='__main__':main()
