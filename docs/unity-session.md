# Quest 3S — entrar na sessão

O headset **não** faz login Google. A pessoa já gerou o código no site. O Unity só pede o JSON público.

## Contrato

`GET https://genjutsuai.vercel.app/api/session?code=AB3K7Q`

Código: 6 caracteres `A–H J–N P–Z 2–9` (sem 0, O, 1, I).

**200**

```json
{
  "session_code": "AB3K7Q",
  "display_name": "Nome",
  "personality_text": "...",
  "archetype": "Ritmo recolhido"
}
```

**400** `invalid_code` · **404** `not_found` (ainda não salvou o perfil / SQL não rodou)

O QR no site aponta para `https://genjutsuai.vercel.app/s/CODIGO` (browser do Quest). Digitar o código no Unity usa a API acima.

## SessionGate.cs (colar no projeto Unity)

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

    public IEnumerator LoadSession(string code) {
        code = (code ?? "").Trim().ToUpperInvariant();
        var url = apiBase + "/api/session?code=" + UnityWebRequest.EscapeURL(code);
        using (var req = UnityWebRequest.Get(url)) {
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success || req.responseCode != 200) {
                Debug.LogWarning("Sessão inválida ou ainda sem resumo.");
                yield break;
            }
            var data = JsonUtility.FromJson<SessionSummary>(req.downloadHandler.text);
            Debug.Log(data.archetype + " / " + data.personality_text);
            // aplicar luz / texto do Corvo aqui
        }
    }
}
```

Teclado no Quest: 6 caracteres. Sem `service_role` e sem token Google no APK.

Plano B: browser do Quest em `/s/CODIGO`.
