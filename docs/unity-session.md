# Quest 3S — sessão definida pelo admin

O headset **não digita código**. Um admin escolhe a sessão atual em `/admin`. O Unity só pede o JSON.

## Expo

1. Visitante responde as duas perguntas e salva sem conta. O site chama `signInAnonymously()` e gera o código (`sql/sessions.sql`, `sql/anonymous_auth.sql`, `sql/profile_id.sql`, com Anonymous sign-ins ligado no dashboard).
2. Staff abre `https://genjutsuai.vercel.app/admin`, cola `ADMIN_SECRET`, escolhe o código, **Definir sessão do Quest**.
3. O Quest chama `GET https://genjutsuai.vercel.app/api/session` (sem query) e carrega essa pessoa.

## Vercel env

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE` (Settings → API → `service_role` — só no servidor)
- `ADMIN_SECRET` (senha longa, só para `/admin`)

## Contrato Unity

`GET https://genjutsuai.vercel.app/api/session`  
`GET https://genjutsuai.vercel.app/api/session?code=AB3K7Q` (NFC / debug)

**200**

```json
{
  "session_code": "AB3K7Q",
  "display_name": "Lina",
  "personality_text": "Lina, o dia abre em água parada. A casa pede silêncio e frescor: respire devagar, que o que é seu chega sem alarde. Este cartão é só o resumo; o dossiê completo fica na conta.",
  "archetype": "Zen",
  "profile_id": "Zen"
}
```

| Campo | Uso |
|---|---|
| `profile_id` | Id estável da demo. Unity escolhe a cena por este campo: `Zen`, `Cyber`, `Excentrico`, `Acolhedor`. `null` se o questionário ainda não foi salvo ou a coluna SQL ainda não existe. |
| `archetype` | Alias legível do mesmo perfil. `Excentrico` aparece como `Excêntrico`. |
| `session_code`, `display_name`, `personality_text` | Iguais ao contrato anterior. |

Erros, sempre JSON `{ "error": "..." }` e sem URL, chave ou corpo do Supabase:

| HTTP | `error` | Quando |
|---|---|---|
| 503 | `missing_config` | `SUPABASE_URL` / anon key ausentes ou recusadas (401/403). |
| 503 | `supabase_unreachable` | DNS, rede, timeout ou resposta inválida. |
| 404 | `no_current_session` | `GET` sem `code` e o admin ainda não definiu a sessão. |
| 404 | `not_found` | Código sem linha em `session_summaries`. |
| 400 | `invalid_code` | Código fora de 6 caracteres do alfabeto da sessão. |

## Mapa do questionário → ProfileId

| clima_ambiente | clima_tempo | profile_id | archetype |
|---|---|---|---|
| tranquilo | frio | Zen | Zen |
| tranquilo | quente | Acolhedor | Acolhedor |
| tranquilo | ameno | Acolhedor | Acolhedor |
| agitado | frio | Cyber | Cyber |
| agitado | ameno | Cyber | Cyber |
| agitado | quente | Excentrico | Excêntrico |

Implementação: `js/zcea-profile.js`. O visitante grava `profile_id` em `dossiers`, em `dossier_data.preferencias` e em `session_summaries` sem login Google.

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
    public string profile_id;
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
            Debug.Log(data.session_code + " " + data.profile_id + " " + data.archetype);
        }
    }
}
```

Sem `service_role` e sem senha admin no APK. Chame `LoadCurrentSession` na tela inicial do dojo (Start / botão “Conectar”).
