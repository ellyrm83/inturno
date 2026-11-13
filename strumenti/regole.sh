#!/bin/bash
# Pubblica le regole di sicurezza di InTurno sul database Firestore (da Google Cloud Shell)
P="${1:-inturno-f5504}"
echo "→ Progetto: $P"
gcloud config set project "$P" >/dev/null 2>&1
T=$(gcloud auth print-access-token 2>/dev/null)
if [ -z "$T" ]; then echo "✗ Accesso non riuscito: chiudi e riapri Cloud Shell, poi riprova."; exit 1; fi
curl -sL https://raw.githubusercontent.com/ellyrm83/inturno/main/firestore.rules -o /tmp/regole.rules || { echo "✗ Non riesco a scaricare le regole"; exit 1; }
API="https://firebaserules.googleapis.com/v1/projects/$P"
H=(-H "Authorization: Bearer $T" -H "Content-Type: application/json" -H "x-goog-user-project: $P")
python3 -c 'import json,sys;print(json.dumps({"source":{"files":[{"name":"firestore.rules","content":open("/tmp/regole.rules").read()}]}}))' > /tmp/rs.json
R=$(curl -s -X POST "${H[@]}" "$API/rulesets" -d @/tmp/rs.json)
N=$(echo "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("name",""))' 2>/dev/null)
if [ -z "$N" ]; then echo "✗ Regole non accettate:"; echo "$R" | head -c 1500; echo; exit 1; fi
echo "→ Regole caricate: $N"
B="{\"release\":{\"name\":\"projects/$P/releases/cloud.firestore\",\"rulesetName\":\"$N\"}}"
O=$(curl -s -X PATCH "${H[@]}" "$API/releases/cloud.firestore" -d "$B")
if ! echo "$O" | grep -q rulesetName; then
  O=$(curl -s -X POST "${H[@]}" "$API/releases" -d "{\"name\":\"projects/$P/releases/cloud.firestore\",\"rulesetName\":\"$N\"}")
fi
if echo "$O" | grep -q rulesetName; then echo "✅ FATTO: regole di InTurno pubblicate sul database."; else echo "✗ Pubblicazione non riuscita:"; echo "$O" | head -c 1500; echo; fi
