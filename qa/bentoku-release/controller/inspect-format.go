// Mandatory runner-side Go standard-library regression; no network/packages.
// Mirrors Docker CLI v27.5.1 inspector.go: typed lookup, then missingkey=error
// JSON-map fallback. It does not claim a daemon integration test.
package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "strings"
  "text/template"
)
type Health struct { Status string }
type State struct { StartedAt string; Status string; Health *Health `json:",omitempty"` }
type Container struct { ID string `json:"Id"`; Image string; Name string; RestartCount int; State State }
const oldFormat = "{\"id\":{{json .Id}},\"image\":{{json .Image}},\"name\":{{json .Name}},\"startedAt\":{{json .State.StartedAt}},\"restartCount\":{{json .RestartCount}},\"status\":{{json .State.Status}},\"health\":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}"
const fixedFormat = "{\"id\":{{json .Id}},\"image\":{{json .Image}},\"name\":{{json .Name}},\"startedAt\":{{json .State.StartedAt}},\"restartCount\":{{json .RestartCount}},\"status\":{{json .State.Status}},\"health\":{{if eq (json (index .State \"Health\")) \"null\"}}null{{else}}{{json .State.Health.Status}}{{end}}}"
const databaseFormat = "{{- $user := false -}}{{- $database := false -}}{{- $seenUser := false -}}{{- $seenDatabase := false -}}{{- $ambiguous := false -}}{{- range .Config.Env -}}{{- $key := index (split . \"=\") 0 -}}{{- if eq $key \"POSTGRES_USER\" -}}{{- if $seenUser -}}{{- $ambiguous = true -}}{{- end -}}{{- $seenUser = true -}}{{- $user = eq . \"POSTGRES_USER=appuser\" -}}{{- end -}}{{- if eq $key \"POSTGRES_DB\" -}}{{- if $seenDatabase -}}{{- $ambiguous = true -}}{{- end -}}{{- $seenDatabase = true -}}{{- $database = eq . \"POSTGRES_DB=gamehub\" -}}{{- end -}}{{- end -}}{{and $user $database (not $ambiguous)}}"

func render(format string, v any) (string,error) {
  funcs:=template.FuncMap{"json":func(v any)string{b,e:=json.Marshal(v);if e!=nil{panic(e)};return string(b)},"split":strings.Split}
  t,e:=template.New("inspect").Option("missingkey=error").Funcs(funcs).Parse(format);if e!=nil{panic(e)}
  var out bytes.Buffer;e=t.Execute(&out,v);return out.String(),e
}
func main() {
  typed:=Container{ID:strings.Repeat("a",64),Image:"sha256:"+strings.Repeat("b",64),Name:"/neighbor",State:State{StartedAt:"2026-10-07T00:00:00Z",Status:"running"}}
  if _,e:=render(oldFormat,typed);e==nil{panic("Typed Id/ID fallback regression was not reached")}
  raw:=func()map[string]any{b,e:=json.Marshal(typed);if e!=nil{panic(e)};var m map[string]any;if json.Unmarshal(b,&m)!=nil{panic("fixture")};return m}
  if _,e:=render(oldFormat,raw());e==nil{panic("Old absent Health regression was not reproduced")}
  cases:=[]struct{name string;change func(map[string]any);health any;invalid bool}{
    {"absent",func(m map[string]any){},nil,false},
    {"null",func(m map[string]any){m["State"].(map[string]any)["Health"]=nil},nil,false},
    {"healthy",func(m map[string]any){m["State"].(map[string]any)["Health"]=map[string]any{"Status":"healthy","Log":"SECRET_CANARY"}},"healthy",false},
    {"unhealthy",func(m map[string]any){m["State"].(map[string]any)["Health"]=map[string]any{"Status":"unhealthy"}},"unhealthy",false},
    {"malformed",func(m map[string]any){m["State"].(map[string]any)["Health"]=map[string]any{"Log":"SECRET_CANARY"}},nil,true},
    {"wrong shape",func(m map[string]any){m["State"].(map[string]any)["Health"]="SECRET_CANARY"},nil,true},
    {"missing Id",func(m map[string]any){delete(m,"Id")},nil,true},
    {"wrong ID",func(m map[string]any){m["ID"]=m["Id"];delete(m,"Id")},nil,true},
    {"missing Image",func(m map[string]any){delete(m,"Image")},nil,true},
    {"missing Name",func(m map[string]any){delete(m,"Name")},nil,true},
    {"missing RestartCount",func(m map[string]any){delete(m,"RestartCount")},nil,true},
    {"missing State",func(m map[string]any){delete(m,"State")},nil,true},
    {"missing StartedAt",func(m map[string]any){delete(m["State"].(map[string]any),"StartedAt")},nil,true},
    {"missing Status",func(m map[string]any){delete(m["State"].(map[string]any),"Status")},nil,true},
  }
  for _,c:=range cases {
    m:=raw();c.change(m);out,e:=render(fixedFormat,m)
    if (e!=nil)!=c.invalid{panic(c.name+": incorrect strict field result")}
    if strings.Contains(out,"SECRET_CANARY"){panic("Private field escaped formatter")}
    if !c.invalid {var r map[string]any;if json.Unmarshal([]byte(out),&r)!=nil||len(r)!=7||r["health"]!=c.health{panic(c.name+": output mismatch")}}
  }
  dbCases:=[]struct{env []string;want string}{
    {[]string{"POSTGRES_USER=appuser","POSTGRES_DB=gamehub","POSTGRES_PASSWORD=SECRET_CANARY"},"true"},
    {[]string{"POSTGRES_USER=other","POSTGRES_DB=gamehub"},"false"},
    {[]string{"POSTGRES_USER=appuser","POSTGRES_DB=other"},"false"},
    {[]string{"POSTGRES_USER=appuser","POSTGRES_USER=appuser","POSTGRES_DB=gamehub"},"false"},
    {[]string{"POSTGRES_USER=appuser","POSTGRES_DB=gamehub","POSTGRES_DB=gamehub"},"false"},
    {[]string{"POSTGRES_USER=appuser"},"false"},
    {[]string{"POSTGRES_DB=gamehub"},"false"},
  }
  for _,c:=range dbCases {out,e:=render(databaseFormat,map[string]any{"Config":map[string]any{"Env":c.env}});if e!=nil||out!=c.want{panic("Database boolean gate mismatch")}}
  fmt.Println("Typed fallback + old formatter regression, 14 strict Health cases and 7 database boolean cases passed; no raw secrets emitted.")
}
