# Homepage OAuth vs Search Console (Vercel)

URL canônico: **https://genjutsuai.vercel.app/**

Na Vercel: Settings → General → altere o **Project Name** para `genjutsuai` (isso muda o subdomínio) **ou** Domains → adicione `genjutsuai.vercel.app`. Depois atualize Site URL no Supabase, origens/redirect no Google e uma propriedade **nova** na Search Console para este host.

O erro **“O site do URL da sua página inicial não está registrado para você”** não se corrige só no código. O Google Cloud consulta a **Search Console** da **mesma conta** do projeto OAuth.

`genjutsuai.vercel.app` é subdomínio da Vercel. Não dá para verificar o domínio `vercel.app`. Só o **prefixo de URL**.

## O que fazer (obrigatório no seu Google)

1. Abra [Search Console](https://search.google.com/search-console) com a **mesma conta** do Cloud (a do Client ID).
2. Adicionar propriedade → **Prefixo do URL** → `https://genjutsuai.vercel.app/` (barra no fim).
3. Escolha **Tag HTML**. Copie só o valor de `content="...."`.
4. Na Vercel → Project → Settings → Environment Variables:
   - Nome: `GOOGLE_SITE_VERIFICATION`
   - Valor: esse `content` (sem aspas)
   - Production + Preview
5. **Redeploy** o `main`.
6. View Source em https://genjutsuai.vercel.app/ e confirme a meta `google-site-verification`.
7. Na Search Console, **Verificar**.
8. No OAuth, homepage exatamente `https://genjutsuai.vercel.app` ou `https://genjutsuai.vercel.app/` — o mesmo da propriedade.
9. Authorized domain: `genjutsuai.vercel.app` (não `vercel.app`).
10. **Corrigir os problemas**.

Se a Search Console já estiver verde e o Cloud ainda recusar, isso é falha conhecida do Google com `*.vercel.app`. Aí: **Testing + testers**, ou domínio próprio, ou “Acredito que os problemas estão incorretos”.

## Arquivo HTML

Se preferir arquivo em vez de tag: baixe o `google….html` da Search Console, coloque na raiz deste repo (como o arquivo antigo do Netlify) e faça push. Depois verifique. Esse token **não** é o mesmo do Netlify.
