# Quest 3S — sessão definida pelo admin

O headset **não digita código**. Um admin escolhe a sessão atual em `/admin`. O Unity só pede o JSON.

## Expo

1. Visitante responde as duas perguntas e salva sem conta. O site chama `signInAnonymously()` e gera o código (`sql/sessions.sql`, `sql/anonymous_auth.sql`, `sql/profile_id.sql`, com Anonymous sign-ins ligado no dashboard).
2. Staff abre `https://genjutsuai.vercel.app/admin` sem PIN, escolhe o código e clica **Iniciar sessão no Quest com este código**. Ativar outra sessão substitui a anterior: só uma fica `active`.
3. O Quest chama `GET https://genjutsuai.vercel.app/api/session` (sem query) e carrega essa pessoa. O `id` (igual ao `session_code`) muda mesmo quando o `profile_id` se repete.
4. **Finalizar sessão** grava `status = ended` e `ended_at`, tira o código de `app_state`, e o próximo poll volta `{ "session": null }` para a sala branca.

## Vercel env

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE` (Settings → API → `service_role` — só no servidor)

`ADMIN_SECRET` não é usada. `/admin` está aberto de propósito neste MVP.

## Contrato Unity

`GET https://genjutsuai.vercel.app/api/session`  
`GET https://genjutsuai.vercel.app/api/session?code=AB3K7Q` (NFC / debug)

O poll **sem query** responde **200** nos dois casos abaixo. Não é erro. `404 no_current_session` saiu do contrato.

**200 — sessão ativa**

```json
{
  "session": {
    "id": "AB3K7Q",
    "session_code": "AB3K7Q",
    "display_name": "Lina",
    "personality_text": "Lina, o dia abre em água parada. A casa pede silêncio e frescor: respire devagar, que o que é seu chega sem alarde. Este cartão é só o resumo; o dossiê completo fica na conta.",
    "archetype": "Zen",
    "profile_id": "Zen",
    "status": "active"
  }
}
```

**200 — sem sessão ativa** (admin ainda não iniciou, ou a sessão foi encerrada)

```json
{ "session": null }
```

Sala branca. O Quest não deve tratar esse 200 como falha de rede.

**200 — sessão encerrada, só no lookup `?code=`**

O poll sem query não devolve a sessão encerrada: ela deixa de ser a ativa e cai no `{ "session": null }`. Quem consulta o código ainda lê o registro:

```json
{
  "session": {
    "id": "AB3K7Q",
    "session_code": "AB3K7Q",
    "display_name": "Lina",
    "personality_text": "Lina, o dia abre em água parada. A casa pede silêncio e frescor: respire devagar, que o que é seu chega sem alarde. Este cartão é só o resumo; o dossiê completo fica na conta.",
    "archetype": "Zen",
    "profile_id": "Zen",
    "status": "ended"
  }
}
```

| Campo | Uso |
|---|---|
| `session` | `null` quando não há sessão ativa. Objeto quando há pessoa para carregar, ou quando `?code=` acha a linha. |
| `id` | Código único da visita. Igual a `session_code`. O Quest compara este campo para trocar de pessoa mesmo se `profile_id` continuar `Zen` (ou outro perfil repetido). |
| `profile_id` | Id estável da demo. Unity escolhe a cena por este campo: `Zen`, `Cyber`, `Excentrico`, `Acolhedor`. `null` se o questionário ainda não foi salvo ou a coluna SQL ainda não existe. |
| `status` | `active` no poll sem query. No `?code=`: `ready` (gravada, fora do Quest), `active` ou `ended`. |
| `archetype` | Alias legível do mesmo perfil. `Excentrico` aparece como `Excêntrico`. |
| `session_code`, `display_name`, `personality_text` | Iguais ao contrato anterior, agora dentro de `session`. |

`profile_id` não é único. Cada visitante gera um `session_code` novo (`sql/session_lifecycle.sql`). A lista de `/admin` mostra todas as linhas: nome, perfil, código e status. Ativar uma sessão põe as outras `active` de volta em `ready`.

Erros, sempre JSON `{ "error": "..." }` e sem URL, chave ou corpo do Supabase. Ausência de sessão ativa **não** entra nesta tabela.

| HTTP | `error` | Quando |
|---|---|---|
| 503 | `missing_config` | `SUPABASE_URL` / anon key ausentes ou recusadas (401/403). |
| 503 | `supabase_unreachable` | DNS, rede, timeout ou resposta inválida. |
| 404 | `not_found` | `?code=` sem linha em `session_summaries`. O poll sem query responde `{ "session": null }`, não 404. |
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

Implementação: `js/zcea-profile.js`. O visitante grava `profile_id` em `dossiers`, em `dossier_data.preferencias` e em `session_summaries` sem login Google. O resumo público só é gravado quando o par de respostas fecha um desses quatro ids. Entrar com Google, sem responder o questionário, não publica `Perfil em formação` nem apaga um quiz já salvo.

`POST /api/admin/session` com `{ "code": "AB3K7Q" }` (o botão **Iniciar sessão no Quest com este código**) devolve:

```json
{ "current_session_code": "AB3K7Q", "display_name": "Lina", "profile_id": "Zen", "status": "active" }
```

`POST /api/admin/session` com `{ "action": "end", "code": "AB3K7Q" }` (o botão **Finalizar sessão**) devolve:

```json
{ "current_session_code": null, "ended_session_code": "AB3K7Q", "status": "ended" }
```

Isso grava `session_summaries.status = ended` e `ended_at`. O poll seguinte é `{ "session": null }`. Exige `sql/session_lifecycle.sql` no Supabase. Sem essa função a API responde `502 { "error": "need_sql" }`.

`profile_id` vem `null` se essa pessoa ainda não salvou o questionário. A lista de `/admin` mostra nome, perfil, código e status de cada sessão, sem agrupar por perfil.

## SessionGate.cs

```csharp
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

[System.Serializable]
public class SessionSummary {
    public string id;
    public string session_code;
    public string display_name;
    public string personality_text;
    public string archetype;
    public string profile_id;
    public string status;
}

[System.Serializable]
public class SessionResponse {
    public SessionSummary session;
}

public class SessionGate : MonoBehaviour {
    public string apiBase = "https://genjutsuai.vercel.app";
    string loadedId = "";

    public IEnumerator LoadCurrentSession() {
        var url = apiBase + "/api/session";
        using (var req = UnityWebRequest.Get(url)) {
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success || req.responseCode != 200) {
                Debug.LogWarning("Falha de rede ao ler a sessão.");
                yield break;
            }
            var data = JsonUtility.FromJson<SessionResponse>(req.downloadHandler.text);
            if (data == null || data.session == null || string.IsNullOrEmpty(data.session.id)) {
                loadedId = "";
                Debug.Log("Sem sessão ativa. Sala branca.");
                yield break;
            }
            if (data.session.id == loadedId) yield break;
            loadedId = data.session.id;
            Debug.Log(data.session.id + " " + data.session.profile_id + " " + data.session.status);
        }
    }
}
```

Sem `service_role` e sem senha admin no APK. Chame `LoadCurrentSession` na tela inicial do dojo (Start / botão “Conectar”).

## Gen e a casa

Luzes, ambiência, cena visual e a voz da Gen estão em [gen-api.md](gen-api.md). `switch_dojo` muda só a cena. `profile_id` continua vindo de `GET /api/session`, que não muda de formato.
