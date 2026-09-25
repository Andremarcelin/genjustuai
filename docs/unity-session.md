# Quest 3S — sessão definida pelo admin

O headset **não digita código**. Um admin escolhe a sessão atual em `/admin`. O Unity só pede o JSON.

## Expo

1. Visitante entra no celular e gera o código (SQL `sessions.sql` + `app_state.sql`).
2. Staff abre `https://genjutsuai.vercel.app/admin`, cola `ADMIN_SECRET`, escolhe o código, **Definir sessão do Quest**.
3. O Quest chama `GET https://genjutsuai.vercel.app/api/session` (sem query) e carrega essa pessoa.

## Vercel env

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE` (Settings → API → `service_role` — só no servidor)
- `ADMIN_SECRET` (senha longa, só para `/admin`)

## Contrato Unity

`GET https://genjutsuai.vercel.app/api/session`

**200** — mesmo JSON de antes (`session_code`, `display_name`, `personality_text`, `archetype`).

**404** `no_current_session` — admin ainda não definiu · **404** `not_found` — código sem resumo.

`GET /api/session?code=AB3K7Q` continua para NFC/debug.

## SessionGate.cs

```csharp
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

[System.Serializable]
public class SessionSummary {
    public string session_code;
    public string display_name;
    public string personality_text;
    public string archetype;
}

public class SessionGate : MonoBehaviour {
    public string apiBase = "https://genjutsuai.vercel.app";

    public IEnumerator LoadCurrentSession() {
        var url = apiBase + "/api/session";
        using (var req = UnityWebRequest.Get(url)) {
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success || req.responseCode != 200) {
                Debug.LogWarning("Nenhuma sessão atual no admin.");
                yield break;
            }
            var data = JsonUtility.FromJson<SessionSummary>(req.downloadHandler.text);
            Debug.Log(data.session_code + " " + data.archetype);
        }
    }
}
```

Sem `service_role` e sem senha admin no APK. Chame `LoadCurrentSession` na tela inicial do dojo (Start / botão “Conectar”).
