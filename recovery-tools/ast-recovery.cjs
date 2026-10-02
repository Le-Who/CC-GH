// Uses the parser already bundled with Node; installs or downloads nothing.
const fs=require('fs'), vm=require('vm');const m={exports:{}};
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],{module:m,exports:m.exports});
const acorn=m.exports;
function children(n){return Object.entries(n).filter(([k])=>!['start','end','loc','scope','parent'].includes(k)).flatMap(([k,v])=>Array.isArray(v)?v.filter(x=>x&&typeof x.type==='string').map(x=>[k,x]):v&&typeof v.type==='string'?[[k,v]]:[])}
function rename(source,globals={},locals={}){
 const free=new Set(); const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),scopes=new WeakMap(),bindings=new WeakMap();const root={parent:null,names:new Map(),isFn:true,map:globals};
 const scopeFor=(parent,isFn,map={})=>({parent,names:new Map(),isFn,map});
 function bind(pattern,scope,kind){if(!pattern)return;switch(pattern.type){case'Identifier':{let target=scope;if(kind==='var')while(!target.isFn)target=target.parent;let b=target.names.get(pattern.name);if(!b){b={name:target.map[pattern.name]||pattern.name};target.names.set(pattern.name,b)}bindings.set(pattern,b);break}case'ObjectPattern':for(const p of pattern.properties)bind(p.type==='RestElement'?p.argument:p.value,scope,kind);break;case'ArrayPattern':for(const p of pattern.elements)bind(p,scope,kind);break;case'AssignmentPattern':bind(pattern.left,scope,kind);break;case'RestElement':bind(pattern.argument,scope,kind)}}
 function walk(n,scope,parent,key,owner){let current=scope;if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type)){if(n.type==='FunctionDeclaration')bind(n.id,scope,'let');let name=n.id?.name||owner;current=scopeFor(scope,true,locals[name]||{});if(n.type==='FunctionExpression'&&n.id)bind(n.id,current,'let');for(const p of n.params)bind(p,current,'let')}else if(n.type==='BlockStatement'&& !['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(parent?.type))current=scopeFor(scope,false);else if(n.type==='CatchClause'){current=scopeFor(scope,false);bind(n.param,current,'let')}
 scopes.set(n,current);if(n.type==='VariableDeclaration')for(const d of n.declarations)bind(d.id,current,n.kind);if(n.type==='ImportDeclaration')for(const s of n.specifiers)bind(s.local,current,'let');
 for(const [k,c]of children(n))walk(c,current,n,k,n.type==='VariableDeclarator'&&k==='init'?n.id.name:['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type)?null:owner);
 }
 walk(ast,root,null,'',null);const edits=[];
 function resolve(scope,name){for(let s=scope;s;s=s.parent)if(s.names.has(name))return s.names.get(name);if(globals[name])return{name:globals[name]};free.add(name);return null}
 function visit(n,parent,key){if(n.type==='Identifier'){
   const isKey=(parent?.type==='MemberExpression'&&key==='property'&&!parent.computed)||((parent?.type==='Property'||parent?.type==='MethodDefinition')&&key==='key'&&!parent.computed)||['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent?.type);
   if(!isKey){const b=bindings.get(n)||resolve(scopes.get(n),n.name);if(b&&b.name!==n.name){let replacement=b.name;if(parent?.type==='Property'&&parent.shorthand&&key==='value')replacement=`${n.name}: ${b.name}`;edits.push([n.start,n.end,replacement])}}
 }for(const[k,c]of children(n))visit(c,n,k)}visit(ast,null,'');
 for(const [s,e,r]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,s)+r+source.slice(e);
 rename.lastFree=[...free];return source;
}
// Formatting is token-preserving: it changes whitespace only, never AST structure.
function format(source){const tokens=[...acorn.tokenizer(source,{ecmaVersion:'latest',sourceType:'module'})]; const templates=new Map(); const parsed=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}); (function visit(n){if(n.type==='TemplateLiteral'){templates.set(n.start,n.end);return}for(const[,c]of children(n))visit(c)})(parsed); let out='',indent=0,paren=0,bracket=0; const stack=[];const nl=()=>{out=out.trimEnd()+'\n'+'  '.repeat(Math.max(0,indent))};
 for(let index=0;index<tokens.length;index++){
 const t=tokens[index], raw=source.slice(t.start,t.end),prev=tokens[index-1],next=tokens[index+1];if(t.type.label==='eof')break; if(templates.has(t.start)){const end=templates.get(t.start);out+=source.slice(t.start,end);while(index+1<tokens.length&&tokens[index+1].end<=end)index++;continue;}
 if(raw==='}'){stack.pop();indent--;nl();out+='}';if(next&&![';',',',')',']','.',':','?','(','=','&&','||','??'].includes(source.slice(next.start,next.end))&&next.type.keyword!=='else'&&next.type.keyword!=='catch'&&next.type.keyword!=='finally')nl();}
 else if(raw==='{'){stack.push('{');out+='{';indent++;nl()}
 else if(raw===';'){out+=';';if(!stack.includes('for'))nl();else out+=' '}
 else if(raw===','){out+=',';if(stack.at(-1)==='{')nl();else out+=' ';}
 else if(raw==='('){stack.push(prev?.type.keyword==='for'?'for':'(');out+='(';paren++}
 else if(raw===')'){stack.pop();out+=')';paren--}
 else if(raw==='['){stack.push('[');out+='[';bracket++}
 else if(raw===']'){stack.pop();out+=']';bracket--}
 else{const previous=out.at(-1); const need=previous&&!/\s/.test(previous)&& ((/^[\w$]/.test(raw)&&/[\w$]/.test(previous))||((raw==='+'||raw==='-')&&raw===previous));if(need)out+=' ';out+=raw;}
 }
 return out.trim()+'\n';
}
function extract(file,names){const src=fs.readFileSync(file,'utf8'),ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'});return ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations.filter(d=>names.includes(d.id.name)).map(d=>`${n.kind} ${src.slice(d.start,d.end)};`):names.includes(n.id?.name)?[src.slice(n.start,n.end)]:[]).join('\n')}

function expandStatements(source){
 const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
 function render(node,parent){
  if(node.type==='UnaryExpression'&&node.operator==='!'&&node.argument.type==='Literal'&&[0,1].includes(node.argument.value))return String(!node.argument.value);
  if(node.type==='ExpressionStatement'&&node.expression.type==='SequenceExpression'){
   const body=node.expression.expressions.map(n=>render(n,node)+';').join('\n');
   return ['Program','BlockStatement'].includes(parent?.type)?body:'{'+body+'}';
  }
  if(node.type==='VariableDeclaration'&&node.declarations.length>1&&!['ForStatement','ForOfStatement','ForInStatement'].includes(parent?.type))return node.declarations.map(n=>node.kind+' '+render(n,node)+';').join('\n');
  const parts=children(node).map(([,n])=>n).sort((a,b)=>a.start-b.start||b.end-a.end);let cursor=node.start, result='';
  for(const n of parts){if(n.start<cursor)continue;result+=source.slice(cursor,n.start)+render(n,node);cursor=n.end;}
  return result+source.slice(cursor,node.end);
 }
 return render(ast,null);
}
module.exports={acorn,extract,rename,format,expandStatements};
