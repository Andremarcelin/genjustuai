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
`GET https://genjutsuai.vercel.app/api/session?code=AB3K7Q` (NFC / debug; o código do QR não muda)

**200**

```json
{
  "session_code": "AB3K7Q",
  "display_name": "Ana",
  "personality_text": "Ana está no perfil Zen (Z). Ana prefere ambiente calmo e frio.",
  "archetype": "Zen",
  "profile_id": "Zen"
}
```

| Campo | Uso |
|---|---|
| `profile_id` | Id estável da demo. Unity escolhe a cena por este campo: `Zen`, `Cyber`, `Excentrico`, `Acolhedor`. `null` se o questionário ainda não foi salvo ou a coluna SQL ainda não existe. |
| `archetype` | Alias legível do mesmo perfil. `Excentrico` aparece como `Excêntrico`. Não usar para o `switch`. |
| `session_code`, `display_name`, `personality_text` | Iguais ao contrato anterior. |

Erros, sempre JSON `{ "error": "..." }` e sem URL, chave ou corpo do Supabase:

| HTTP | `error` | Quando |
|---|---|---|
| 503 | `missing_config` | `SUPABASE_URL` / anon key ausentes ou recusadas (401/403). |
| 503 | `supabase_unreachable` | DNS, rede, timeout ou resposta inválida. Não é mais um crash 500. |
| 404 | `no_current_session` | `GET` sem `code` e o admin ainda não definiu a sessão. |
| 404 | `not_found` | Código sem linha em `session_summaries`. |
| 400 | `invalid_code` | Código fora de 6 caracteres do alfabeto da sessão. |

`/api/admin/session` usa os mesmos `missing_config` e `supabase_unreachable`. O PIN continua no header; a resposta não devolve `detail` do Postgres.

## Mapa do questionário → ProfileId

Hipótese da demo, para validar. Não são os 8 arquétipos do CDD. As duas perguntas do site (`clima_ambiente`, `clima_tempo`) caem numa célula só:

| clima_ambiente | clima_tempo | profile_id | archetype |
|---|---|---|---|
| tranquilo | frio | Zen | Zen |
| tranquilo | quente | Acolhedor | Acolhedor |
| tranquilo | ameno | Acolhedor | Acolhedor |
| agitado | frio | Cyber | Cyber |
| agitado | ameno | Cyber | Cyber |
| agitado | quente | Excentrico | Excêntrico |

Implementação: `js/zcea-profile.js`. O site grava `profile_id` em `dossiers`, em `dossier_data.preferencias` e em `session_summaries`. O QR continua apontando para `/s/CODIGO`.

## SessionGate.cs

Exemplo só de leitura. O C# do Quest não mora neste repositório.

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
                Debug.LogWarning("Sessão indisponível: " + req.downloadHandler.text);
                yield break;
            }
            var data = JsonUtility.FromJson<SessionSummary>(req.downloadHandler.text);
            Debug.Log(data.session_code + " " + data.profile_id + " " + data.archetype);
            switch (data.profile_id) {
                case "Zen":
                case "Cyber":
                case "Excentrico":
                case "Acolhedor":
                    break;
                default:
                    Debug.LogWarning("profile_id ausente. O visitante ainda não salvou o questionário ZCEA.");
                    break;
            }
        }
    }
}
```

Sem `service_role` e sem senha admin no APK. Chame `LoadCurrentSession` na tela inicial do dojo (Start / botão “Conectar”).

O teste ponta a ponta no ar só fecha depois de `SUPABASE_URL` e `SUPABASE_ANON_KEY` válidos na Vercel e de `sql/profile_id.sql` no SQL Editor. Checklist na seção do README “Perfil ZCEA”.
