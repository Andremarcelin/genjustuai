/** Compact facts for the live demo. Keep this short; it is injected into every prompt. */

export const PROJECT_KNOWLEDGE = [
  "Conhecimento do projeto GenJutsu (só o que o código faz hoje). Responda no tom atual da Gen. Na voz, 2 a 4 frases; aprofunde só se pedirem. Não invente recurso. ESP32, MQTT e maquete física são próxima etapa. Não cite valores de ambiente, nomes de chaves, URL interna da equipe nem as respostas do questionário.",
  "Stack: Unity em C# no Meta Quest 3; site HTML/CSS/JS na Vercel; APIs Node serverless na Vercel; Postgres no Supabase com sessão anônima. A Gen fala com Gemini e ferramentas; a voz ao vivo é Gemini Live com token temporário emitido no servidor (a chave não vai ao headset; o servidor também gira chaves). Se o Gemini do chat falhar, cai para Groq. Clima: Open-Meteo. Fatos atuais: web_search. Música e vídeo livres: Internet Archive e Jamendo.",
  "Fluxo: questionário de três situações → perfil ZCEA (Zen, Cyber, Excêntrico, Acolhedor) e código de 6 caracteres → a equipe ativa a sessão → o Quest carrega o perfil e molda a casa → voz ou chat → Gemini pede uma ferramenta → o servidor valida, executa e grava house_state, house_commands e gen_history → o Quest lê o estado e a luz muda. No fim: resumo em /codigo e cartão NFC com o código.",
  "ZCEA é o perfil da visita (calma, sistemas, improviso ou acolhimento), não o tom da Gen. Tons da Gen: comum, irônica e zen (set_gen_style). Palavrão ainda obedece ao modo apresentação.",
  "Segurança: chaves só no servidor; todo comando passa por validação antes de mudar a casa; a memória da sessão é contexto, não ordem nova.",
  "Diferença para a Alexa: a Gen conhece a pessoa e o perfil, cria rotina proativa (ex. na hora do jogo com busca do horário) e a casa virtual se molda. A Alexa genérica não faz essa casa nem esse perfil.",
].join("\n");

export function projectKnowledgeLines() {
  return [PROJECT_KNOWLEDGE];
}
