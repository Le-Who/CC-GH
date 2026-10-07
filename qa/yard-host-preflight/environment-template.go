package main

import (
 "bytes"
 "encoding/json"
 "fmt"
 "os"
 "strings"
 "text/template"
)

func main() {
 source,err:=os.ReadFile(os.Args[1]);if err!=nil{panic(err)}
 funcs:=template.FuncMap{"split":strings.Split,"json":func(v any)string{b,e:=json.Marshal(v);if e!=nil{panic(e)};return string(b)}}
 t,err:=template.New("environment").Funcs(funcs).Parse(strings.ReplaceAll(string(source),"__EXPECTED_BUILD__",strings.Repeat("a",40)));if err!=nil{panic(err)}
 base:=map[string]any{"Env":[]string{"NODE_ENV=production","APP_BUILD_ID="+strings.Repeat("a",40),"SECRET_CANARY=DO_NOT_EMIT"},"Cmd":[]string{"node","server.js"},"Entrypoint":[]string{"docker-entrypoint.sh"}}
 cases:=[]struct{name string;env []string;cmd []string;entry []string;unsafe bool}{
  {"safe",nil,nil,nil,false},
  {"explicit safe",[]string{"NODE_ENV=production","APP_BUILD_ID="+strings.Repeat("a",40),"DEV_AUTH_ENABLED=false","NODE_OPTIONS="},nil,nil,false},
  {"nonproduction",[]string{"NODE_ENV=development"},nil,nil,true},
  {"dev auth",[]string{"NODE_ENV=production","DEV_AUTH_ENABLED=true"},nil,nil,true},
  {"preload",[]string{"NODE_ENV=production","NODE_OPTIONS=--require SECRET_CANARY"},nil,nil,true},
  {"loader",[]string{"NODE_ENV=production","NODE_OPTIONS=--import=data:text/javascript,SECRET_CANARY"},nil,nil,true},
  {"unknown node options",[]string{"NODE_ENV=production","NODE_OPTIONS=--max-old-space-size=64"},nil,nil,true},
  {"duplicate",[]string{"NODE_ENV=production","NODE_ENV=production","APP_BUILD_ID="+strings.Repeat("a",40)},nil,nil,true},
  {"unknown command",nil,[]string{"node","--require","SECRET_CANARY","server.js"},nil,true},
  {"unknown entrypoint",nil,nil,[]string{"SECRET_CANARY"},true},
 }
 for _,c:=range cases{
  config:=map[string]any{};for k,v:=range base{config[k]=v};if c.env!=nil{config["Env"]=c.env};if c.cmd!=nil{config["Cmd"]=c.cmd};if c.entry!=nil{config["Entrypoint"]=c.entry}
  var out bytes.Buffer;if err:=t.Execute(&out,map[string]any{"Config":config});err!=nil{panic(err)}
  if strings.Contains(out.String(),"SECRET_CANARY")||strings.Contains(out.String(),"DO_NOT_EMIT"){panic("Secret escaped template")}
  var values map[string]bool;if err:=json.Unmarshal(out.Bytes(),&values);err!=nil{panic(err)};if len(values)!=5{panic("Unexpected fields")}
  unsafe:=false;for _,value:=range values{if !value{unsafe=true}};if unsafe!=c.unsafe{panic(c.name+": unexpected result")}
 }
 fmt.Println("10 environment-template cases passed; only five booleans emitted.")
}
