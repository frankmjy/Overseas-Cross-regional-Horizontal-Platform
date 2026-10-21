from pathlib import Path
import json,gzip,base64,hashlib,shutil
root=Path('reports/source-references-20261018')
source=max(Path('C:/Users/36056/Downloads').glob('*.base'),key=lambda p:p.stat().st_mtime)
raw=json.loads(source.read_bytes())
def pack(x):return base64.b64encode(gzip.compress(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode('utf8'))).decode()
def decode(v):return json.loads(gzip.decompress(base64.b64decode(v)))
# Keep the original export intact. The import candidate contains no workflow or webhook payload.
shutil.copyfile(source,root/'source-project.base')
d=dict(raw);snap=decode(d['gzipSnapshot'])
for entry in snap:
 b=entry['schema']['base']
 b['blocks']=[x for x in b.get('blocks',[]) if not x.startswith('wkf') and x not in ['bfl4j541sU8GdUNq','bflhcdRV4nwVPwzs']]
 b['blockInfos']={k:v for k,v in b.get('blockInfos',{}).items() if not k.startswith('wkf') and k not in ['bfl4j541sU8GdUNq','bflhcdRV4nwVPwzs']}
d['gzipSnapshot']=pack(snap)
d['gzipAutomation']=pack([]);d['gzipAutomationButtonRule']=pack({})
for key in ['gzipBaseRole','gzipAccessConfig']:
 # Destination permissions must be determined by the existing Base.
 if key in d:d.pop(key)
out=root/'thailand-business-only.base';out.write_text(json.dumps(d,separators=(',',':')),encoding='utf8')
assert decode(d['gzipAutomation'])==[] and decode(d['gzipAutomationButtonRule'])=={}
# Remove decoded credential-bearing inspection output; retain only an inventory.
a=decode(raw['gzipAutomation'])
(root/'gzipAutomation.json').write_text(json.dumps([{'id':v.get('id'),'trigger_name':v.get('trigger_name'),'status':v.get('status')} for v in a],ensure_ascii=False,indent=2),encoding='utf8')
(root/'gzipAutomationButtonRule.json').write_text(json.dumps({'redacted':True,'entries':len(decode(raw['gzipAutomationButtonRule']))}),encoding='utf8')
print(json.dumps({'candidate':str(out),'bytes':out.stat().st_size,'tables':len(set(x['schema']['data']['table']['meta']['id'] for x in snap)),'workflows':0,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
