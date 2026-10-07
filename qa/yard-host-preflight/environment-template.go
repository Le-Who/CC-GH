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
 t,err:=template.New("environment").Option("missingkey=error").Funcs(funcs).Parse(strings.ReplaceAll(string(source),"__EXPECTED_BUILD__",strings.Repeat("a",40)));if err!=nil{panic(err)}
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
 checkNeighbors(funcs)
 fmt.Println("10 environment-template and 15 strict neighbor-template cases passed; no raw fixture values emitted.")
}

// Use Docker inspect's raw JSON map shape and strict missing-key behavior.
// Optional Health alone uses index; required identity/state fields stay strict.
func checkNeighbors(funcs template.FuncMap) {
 const rowFormat = `{"id":{{json .Id}},"image":{{json .Image}},"startedAt":{{json .State.StartedAt}},"restarts":{{json .RestartCount}},"status":{{json .State.Status}},"health":{{if eq (json (index .State "Health")) "null"}}null{{else}}{{json .State.Health.Status}}{{end}}}`
 const healthFormat = `{{if eq (json (index .State "Health")) "null"}}none{{else}}{{.State.Health.Status}}{{end}}`
 const oldHealthFormat = `{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}`
 render := func(format string, value map[string]any) (string, error) {
  t, err := template.New("neighbor").Option("missingkey=error").Funcs(funcs).Parse(format)
  if err != nil { panic(err) }
  var out bytes.Buffer
  err = t.Execute(&out, value)
  return out.String(), err
 }
 fixture := func() map[string]any {
  return map[string]any{"Id":strings.Repeat("b",64), "Image":"sha256:"+strings.Repeat("c",64), "RestartCount":float64(0), "State":map[string]any{"StartedAt":"2026-10-07T00:00:00Z", "Status":"running", "Running":true}, "Name":"SECRET_CANARY", "Config":map[string]any{"Env":[]string{"SECRET_CANARY=DO_NOT_EMIT"}}}
 }
 if _, err := render(oldHealthFormat, fixture()); err == nil { panic("Absent Health regression was not reproduced") }
 cases := []struct{name string; mutate func(map[string]any); wantHealth string; invalid bool}{
  {"absent Health",func(v map[string]any){},"none",false},
  {"null Health",func(v map[string]any){v["State"].(map[string]any)["Health"]=nil},"none",false},
  {"healthy",func(v map[string]any){v["State"].(map[string]any)["Health"]=map[string]any{"Status":"healthy","Log":"SECRET_CANARY"}},"healthy",false},
  {"unhealthy",func(v map[string]any){v["State"].(map[string]any)["Health"]=map[string]any{"Status":"unhealthy"}},"unhealthy",false},
  {"starting",func(v map[string]any){v["State"].(map[string]any)["Health"]=map[string]any{"Status":"starting"}},"starting",false},
  {"missing Id",func(v map[string]any){delete(v,"Id")},"",true},
  {"ID cannot substitute Id",func(v map[string]any){v["ID"]=v["Id"];delete(v,"Id")},"",true},
  {"missing Image",func(v map[string]any){delete(v,"Image")},"",true},
  {"missing RestartCount",func(v map[string]any){delete(v,"RestartCount")},"",true},
  {"missing State",func(v map[string]any){delete(v,"State")},"",true},
  {"missing StartedAt",func(v map[string]any){delete(v["State"].(map[string]any),"StartedAt")},"",true},
  {"missing Status",func(v map[string]any){delete(v["State"].(map[string]any),"Status")},"",true},
  {"empty Health is malformed",func(v map[string]any){v["State"].(map[string]any)["Health"]=map[string]any{}},"",true},
  {"Health missing Status",func(v map[string]any){v["State"].(map[string]any)["Health"]=map[string]any{"Log":"SECRET_CANARY"}},"",true},
 }
 for _, c := range cases {
  v:=fixture();c.mutate(v)
  row, err:=render(rowFormat,v)
  if (err!=nil)!=c.invalid { panic(c.name+": unexpected required-field result") }
  if strings.Contains(row,"SECRET_CANARY")||strings.Contains(row,"DO_NOT_EMIT") { panic("Raw fixture data escaped formatter") }
  if c.invalid {continue}
  var result map[string]any
  if json.Unmarshal([]byte(row),&result)!=nil||len(result)!=6 { panic("Invalid row") }
  health,err:=render(healthFormat,v)
  if err!=nil||health!=c.wantHealth {panic(c.name+": unexpected health result")}
  if health=="none" {if result["health"]!=nil {panic("Absent health must remain null")}} else if result["health"]!=health {panic("Health mismatch")}
 }
 v:=fixture();delete(v["State"].(map[string]any),"Running")
 if _,err:=render(`{{.State.Running}}`,v);err==nil {panic("Required Running field was weakened")}
}
