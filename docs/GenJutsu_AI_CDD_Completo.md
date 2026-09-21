# GenJutsu AI — CDD (Cognitive-Driven Development)
## Documento Mestre de Decisões, Evidências, Requisitos e Plano de Execução

**Projeto:** GenJutsu AI  
**Contexto:** ExpoTech 2026.2 — Missão 2050: Smart Home & Tecnologias do Futuro  
**Categoria:** INTELLIGENCE — 4º Semestre — Gestão da Tecnologia da Informação  
**Evento:** 28 de novembro de 2026  
**Instituição:** UniFECAF  
**Versão:** 1.0  
**Data de consolidação:** 21/09/2026  
**Status:** Arquitetura e plano consolidados; implementação em execução

---

# 1. Propósito deste documento

Este documento é o registro mestre de **Cognitive-Driven Development (CDD)** do GenJutsu AI.

O objetivo é manter, em um único artefato versionado, as decisões tomadas para:

- definição do problema;
- objetivos e hipótese;
- requisitos acadêmicos;
- arquitetura;
- dataset;
- Machine Learning;
- Deep Learning;
- NLP;
- IA Generativa;
- Prompt Engineering;
- AI-Driven Software Engineering;
- backend e banco de dados;
- autenticação e consentimento;
- Unity/VR;
- IoT/ESP32/MQTT;
- testes;
- versionamento;
- documentação;
- evidências;
- cronograma;
- preparação para banca e ExpoTech.

A regra central do CDD adotado é:

> **Problema → hipótese → comportamento esperado → teste → implementação pequena → validação → leitura do diff → decisão humana → documentação → commit.**

A IA é utilizada como ferramenta de apoio ao desenvolvimento, mas suas sugestões não são consideradas automaticamente corretas.

---

# 2. Fontes e escopo

## 2.1 Fonte principal: roteiro oficial da missão

O roteiro da categoria INTELLIGENCE exige:

1. definição do problema e dataset;
2. Machine Learning e Deep Learning com treinamento e métricas apropriadas;
3. Gen AI e Prompt Engineering;
4. NLP aplicado ao contexto doméstico;
5. AI-Driven Software Engineering;
6. versionamento em Git/GitHub.

O roteiro também indica Python, TensorFlow/PyTorch, Hugging Face Transformers, OpenAI API/LlamaIndex e Git/GitHub.

## 2.2 Regras acadêmicas relevantes

O roteiro informa:

- equipes de 3 a 5 integrantes;
- integrantes da mesma turma/semestre;
- inscrição obrigatória até 11/09/2026;
- avaliação individual entre 09 e 13/11/2026;
- qualquer integrante pode ser questionado sobre qualquer parte do projeto;
- convocação para ExpoTech entre 16 e 20/11/2026;
- ExpoTech em 28/11/2026;
- após a avaliação individual, o projeto não pode ser alterado.

## 2.3 Materiais de Machine Learning / Deep Learning

Os materiais estudados orientam o uso de:

- pipeline de aprendizado de máquina;
- aprendizado supervisionado e não supervisionado;
- algoritmos de classificação;
- Ridge/Lasso quando aplicável;
- hiperparâmetros;
- redes neurais;
- funções de ativação;
- loss;
- otimização/backpropagation;
- treinamento e validação;
- métricas;
- matriz de confusão;
- identificação e tratamento de overfitting;
- frameworks de ML/DL;
- integração por APIs.

## 2.4 Materiais de AI-Driven Development

A prática adotada considera IA como ferramenta de apoio para:

- explicar conceitos;
- propor transformações;
- interpretar erros;
- sugerir testes;
- revisar justificativas;
- auxiliar documentação;
- apoiar refatoração.

A decisão final permanece humana e deve ser baseada em testes, inspeção e evidências.

---

# 3. Visão do produto

## 3.1 Definição

O **GenJutsu AI** é uma plataforma de inteligência aplicada a Smart Home que transforma dados de interação e preferências em contexto e utiliza Machine Learning, Deep Learning, NLP e IA Generativa para produzir uma experiência doméstica personalizada.

## 3.2 Conceito central

> **O GenJutsu AI transforma dados de interação em contexto, contexto em inteligência e inteligência em uma experiência doméstica personalizada.**

## 3.3 Diferencial

O sistema não deve ser apresentado simplesmente como "uma casa com ChatGPT".

O diferencial é a integração:

```text
DADOS
  ↓
DATASET
  ↓
PREPROCESSAMENTO
  ↓
ML / DL
  ↓
PERFIL
  ↓
NLP
  ↓
CONTEXT ENGINE
  ↓
PROMPT ENGINEERING
  ↓
IA GENERATIVA
  ↓
CORVO
  ↓
SMART HOME
  ↓
EXPERIÊNCIA
```

---

# 4. Problema

## 4.1 Problema de negócio/tecnologia

Como transformar dados de interação e preferências de um usuário em uma configuração personalizada de Smart Home utilizando modelos de Machine Learning/Deep Learning e IA Generativa?

## 4.2 Problema acadêmico

Demonstrar um pipeline completo no qual dados brutos são processados e transformados em informação contextualizada, previsão/classificação, interpretação de linguagem e geração de respostas naturais.

---

# 5. Hipótese

> Dados comportamentais e interacionais podem ser transformados em variáveis de contexto capazes de orientar modelos de Machine Learning e IA Generativa na produção de uma experiência doméstica personalizada.

A hipótese será avaliada por experimentos e métricas, não apenas por demonstração visual.

---

# 6. Objetivos

## 6.1 Objetivo geral

Construir um protótipo integrado de Smart Home inteligente capaz de utilizar dados de interação para gerar uma experiência personalizada por meio de ML/DL, NLP e IA Generativa.

## 6.2 Objetivos específicos

- construir/selecionar dataset adequado;
- realizar limpeza e preparação de dados;
- realizar análise exploratória;
- construir baseline;
- treinar modelos de Machine Learning;
- treinar modelo de Deep Learning;
- avaliar os modelos;
- implementar NLP para comandos domésticos;
- integrar IA Generativa;
- documentar Prompt Engineering;
- implementar Context Engine;
- disponibilizar APIs;
- integrar Unity/Meta Quest 3S;
- integrar ESP32/MQTT quando necessário;
- registrar o desenvolvimento assistido por IA;
- manter o projeto versionado;
- preparar evidências para banca;
- preparar demonstração final.

---

# 7. Escopo funcional

## 7.1 Fluxo principal

```text
VISITANTE
   ↓
LOGIN
   ↓
CONSENTIMENTO
   ↓
QUESTIONÁRIO / INTERAÇÃO
   ↓
PROCESSAMENTO
   ↓
ML / DL
   ↓
PERFIL
   ↓
NLP
   ↓
CONTEXT ENGINE
   ↓
GEN AI
   ↓
CORVO
   ↓
UNITY / QUEST 3S
   ↓
CASA PERSONALIZADA
   ↓
MAQUETE / ESP32 / MQTT
   ↓
RESUMO DA EXPERIÊNCIA
   ↓
NFC
```

## 7.2 Funcionalidades

- autenticação;
- consentimento;
- criação de sessão;
- coleta de respostas;
- processamento do perfil;
- classificação do arquétipo;
- interpretação de linguagem;
- conversa com Corvo;
- geração de configuração da casa;
- visualização em Unity;
- interação em VR;
- integração física opcional;
- geração de resumo;
- consulta posterior da experiência por NFC.

---

# 8. Arquétipos da casa

A personalização será representada por arquétipos.

## 8.1 Refúgio

```text
COMFORT ↑
PRIVACY ↑
ENERGY ↓
```

## 8.2 Sintetizador

```text
TECH ↑
CURIOSITY ↑
ORDER ↑
```

## 8.3 Laboratório

```text
CURIOSITY ↑
TECH ↑
ORDER ↑
```

## 8.4 Jardim Vivo

```text
NATURE ↑
COMFORT ↑
```

## 8.5 Galeria

```text
ORDER ↑
PRIVACY ↑
```

## 8.6 Núcleo Social

```text
SOCIAL ↑
ENERGY ↑
```

## 8.7 Estúdio Criativo

```text
CURIOSITY ↑
ENERGY ↑
```

## 8.8 Observatório

```text
PRIVACY ↑
CURIOSITY ↑
ORDER ↑
```

---

# 9. Modelo de perfil

O perfil utiliza características normalizadas entre 0 e 1.

```json
{
  "curiosity": 0.88,
  "technology": 0.91,
  "order": 0.72,
  "comfort": 0.61,
  "energy": 0.55,
  "social": 0.34,
  "nature": 0.42,
  "privacy": 0.79
}
```

Características iniciais:

- curiosity;
- technology;
- order;
- comfort;
- energy;
- social;
- nature;
- privacy.

---

# 10. Dataset

## 10.1 Estratégia

Serão utilizados dois níveis:

### Dataset sintético

Utilizado para desenvolvimento inicial e treinamento experimental.

Deve ser claramente identificado como sintético.

### Dataset experimental

Obtido durante testes controlados e experiências reais autorizadas.

## 10.2 Campos

Estrutura inicial:

```text
session_id
user_id_hash
question_id
question_answer
curiosity
technology
order
comfort
energy
social
nature
privacy
interaction_type
object_selected
time_spent
voice_command
intent
house_archetype
```

## 10.3 Regras

- não armazenar dados desnecessários;
- separar identificadores de dados analíticos;
- documentar origem;
- documentar transformação;
- manter versão do dataset;
- não misturar silenciosamente dados sintéticos e reais;
- registrar o significado de cada coluna.

---

# 11. Pipeline de dados

```text
COLETA
 ↓
RAW DATA
 ↓
VALIDAÇÃO
 ↓
LIMPEZA
 ↓
TRANSFORMAÇÃO
 ↓
NORMALIZAÇÃO
 ↓
DATASET PROCESSADO
 ↓
EDA
 ↓
TREINO
 ↓
VALIDAÇÃO
 ↓
TESTE
```

---

# 12. Data Cleaning

Procedimentos:

- verificar duplicatas;
- identificar valores ausentes;
- tratar inconsistências;
- verificar outliers;
- normalizar variáveis;
- codificar categorias;
- verificar distribuição;
- separar treino/validação/teste.

Toda transformação relevante deve ser documentada.

---

# 13. EDA

O notebook de análise exploratória deve investigar:

- distribuição das características;
- correlação;
- frequência de interações;
- distribuição dos arquétipos;
- tempo de interação;
- possíveis classes desbalanceadas;
- relações entre variáveis.

Entregáveis:

```text
notebooks/03_eda.ipynb
docs/results/eda.md
evidence/eda/
```

---

# 14. Machine Learning

## 14.1 Objetivo

Classificar o arquétipo da casa a partir das características do perfil.

## 14.2 Entrada

```text
curiosity
technology
order
comfort
energy
social
nature
privacy
```

## 14.3 Saída

```text
house_archetype
```

## 14.4 Baseline

Antes dos modelos complexos, implementar uma regra simples de referência.

Objetivo:

- estabelecer uma linha de base;
- verificar se os modelos aprendem algo além de regras simples;
- fornecer comparação experimental.

## 14.5 Modelos candidatos

- Logistic Regression;
- Random Forest;
- Gradient Boosting.

A escolha final deverá ser registrada após os experimentos.

## 14.6 Métricas

Para classificação:

- accuracy;
- precision;
- recall;
- F1-score;
- matriz de confusão.

A escolha de métricas deve ser justificada pelo problema e pela distribuição das classes.

---

# 15. Ridge e Lasso

Ridge/Lasso não serão incluídos artificialmente apenas para "cumprir conteúdo".

Serão utilizados quando fizerem sentido como experimento de regularização/modelagem.

Registrar:

```text
modelo
hiperparâmetros
resultado
interpretação
decisão
```

---

# 16. Hiperparâmetros

Exemplo de experimento:

```text
Random Forest

n_estimators:
50
100
200

max_depth:
5
10
20
```

Cada experimento deverá possuir:

```text
ID
modelo
parâmetros
dataset
métrica
resultado
decisão
```

---

# 17. Deep Learning

## 17.1 Objetivo

Construir uma rede neural para classificação do arquétipo.

## 17.2 Arquitetura inicial

```text
INPUT
8 features
   ↓
Dense 32
ReLU
   ↓
Dropout
   ↓
Dense 16
ReLU
   ↓
Dense 8
Softmax
   ↓
8 arquétipos
```

A arquitetura poderá ser ajustada somente após experimentos documentados.

## 17.3 Framework

TensorFlow/Keras ou PyTorch.

A escolha final deve ser registrada no ADR correspondente.

---

# 18. Treinamento de Deep Learning

Registrar:

- epochs;
- batch size;
- learning rate;
- loss;
- accuracy;
- validation loss;
- validation accuracy;
- seed quando aplicável;
- versão do dataset;
- versão do código.

Gerar:

- curva de treinamento;
- curva de validação;
- métricas finais;
- matriz de confusão.

---

# 19. Overfitting

O projeto deve investigar overfitting.

Possíveis técnicas:

- Dropout;
- Early Stopping;
- regularização;
- mais dados;
- ajuste de arquitetura.

Critério:

```text
training performance
vs.
validation performance
```

A decisão sobre tratamento deve ser baseada nos resultados.

---

# 20. NLP

## 20.1 Objetivo

Interpretar comandos e frases relacionados à casa.

## 20.2 Pipeline

```text
VOZ
 ↓
SPEECH-TO-TEXT
 ↓
TEXTO
 ↓
NLP
 ↓
INTENT
 ↓
ENTITIES
 ↓
CONTEXT ENGINE
 ↓
AÇÃO / RESPOSTA
```

## 20.3 Intents iniciais

```text
greeting
change_light
change_temperature
ask_house_state
ask_recommendation
activate_scene
change_music
explore_object
ask_about_ai
finish_experience
```

## 20.4 Entidades

Exemplo:

Entrada:

> Acenda a luz da sala.

Saída:

```json
{
  "intent": "change_light",
  "room": "living_room",
  "state": "on"
}
```

---

# 21. Hugging Face

O projeto pode utilizar modelos pré-treinados de Hugging Face Transformers para tarefas de NLP.

Não é objetivo treinar um Transformer do zero.

Possíveis aplicações:

- classificação de intenção;
- embeddings;
- representação semântica;
- classificação textual.

A escolha do modelo deverá considerar:

- desempenho;
- tamanho;
- latência;
- facilidade de integração;
- disponibilidade.

---

# 22. NLP + LLM

A arquitetura separa:

```text
NLP
 ↓
estrutura e intenção
 ↓
LLM
 ↓
linguagem natural
```

O LLM não deve substituir automaticamente todo o pipeline de NLP.

---

# 23. IA Generativa

## 23.1 Papel

A IA Generativa será responsável principalmente por:

- diálogo;
- explicações;
- resumos;
- recomendações;
- adaptação de linguagem;
- interpretação contextual quando apropriado.

## 23.2 Corvo

O Corvo é a persona/interface conversacional da IA.

O Corvo deve receber:

- perfil;
- estado da casa;
- histórico relevante;
- resultado de ML/DL;
- resultado de NLP;
- ferramentas permitidas;
- regras de segurança e contexto.

---

# 24. Prompt Engineering

Criar pasta:

```text
/prompts
```

Arquivos:

```text
system.md
intent.md
summary.md
recommendation.md
house_generation.md
```

## 24.1 Estrutura

```text
PERSONA
+
PERFIL
+
ESTADO DA CASA
+
HISTÓRICO
+
REGRAS
+
FERRAMENTAS
```

## 24.2 Experimento

Comparar pelo menos três estratégias:

```text
Prompt A — simples
Prompt B — com contexto
Prompt C — estruturado
```

Avaliar:

- coerência;
- aderência ao contexto;
- alucinação;
- clareza;
- tempo;
- consumo de tokens quando mensurável.

---

# 25. Context Engine

O Context Engine é a camada que integra as diferentes fontes de inteligência.

Entrada:

```text
USER PROFILE
+
ML RESULT
+
DL RESULT
+
NLP RESULT
+
HOUSE STATE
+
INTERACTION HISTORY
```

Saída:

```json
{
  "house": "laboratorio",
  "lighting": "low",
  "temperature": "cool",
  "voice_tone": "curious",
  "notification_level": "low"
}
```

---

# 26. Personalização

A personalização não será implementada como um modelo de IA separado para cada usuário.

Modelo-base:

```text
MODEL
+
USER CONTEXT
```

A experiência é personalizada por:

- perfil;
- histórico;
- estado;
- preferências;
- interação atual;
- contexto.

---

# 27. Ferramentas da IA

O LLM não terá acesso irrestrito ao sistema.

Ferramentas controladas:

```text
set_light()
set_temperature()
activate_scene()
get_house_state()
get_user_profile()
```

Fluxo:

```text
LLM
 ↓
tool request
 ↓
validação
 ↓
execução permitida
 ↓
resultado
 ↓
LLM
```

---

# 28. Backend

Tecnologia planejada:

```text
Python
FastAPI
```

Endpoints iniciais:

```text
POST /auth
POST /experience
POST /profile
POST /predict
POST /nlp/intent
POST /chat
POST /house/generate
GET  /house/state
GET  /experience/{id}
POST /experience/{id}/finish
```

---

# 29. Banco de dados

PostgreSQL/Supabase.

Tabelas iniciais:

```text
users
experiences
personality_profiles
preferences
interactions
house_configs
session_summary
```

Campos de auditoria recomendados:

```text
created_at
updated_at
session_id
```

---

# 30. Autenticação

Fluxo:

```text
LOGIN
 ↓
GOOGLE OAUTH
 ↓
CONSENTIMENTO
 ↓
RETORNO
 ↓
SESSÃO
```

O projeto não deve coletar dados de terceiros indiscriminadamente.

Os dados devem ter finalidade clara e ser minimizados.

---

# 31. Consentimento e privacidade

Registrar:

```text
consent_status
consent_timestamp
```

A interface deve explicar:

- quais dados são utilizados;
- por que são utilizados;
- como contribuem para personalização;
- possibilidade de recusar permissões;
- finalidade da experiência.

Não armazenar credenciais ou secrets no repositório.

---

# 32. Segredos

Nunca versionar:

```text
API_KEY
PASSWORD
GOOGLE_CLIENT_SECRET
DATABASE_PASSWORD
```

Usar:

```text
.env
.env.example
```

---

# 33. Frontend

Stack planejada:

```text
Next.js
```

Responsabilidades:

- autenticação;
- consentimento;
- questionário;
- perfil;
- experiência;
- resumo;
- acesso à experiência via NFC.

---

# 34. Unity / VR

Unity é a camada de experiência imersiva.

Arquitetura:

```text
Unity
 ↓
API
 ↓
Backend
 ↓
Context Engine
```

O Unity não deve concentrar a inteligência de negócio.

---

# 35. Meta Quest 3S

Fluxo:

```text
Quest 3S
 ↓
Unity
 ↓
Microfone
 ↓
Speech
 ↓
NLP
 ↓
Backend
 ↓
Corvo
 ↓
Unity
```

O VR representa a experiência gerada pelo sistema.

---

# 36. IoT

Quando utilizado:

```text
Backend
 ↓
MQTT
 ↓
ESP32
 ↓
LED / RELÉ / SENSOR
```

E no sentido inverso:

```text
SENSOR / ESP32
 ↓
MQTT
 ↓
Backend
 ↓
Context Engine
```

---

# 37. Maquete

A maquete representa fisicamente o estado da casa.

Exemplos:

- iluminação;
- porta;
- sensores;
- efeitos;
- movimento.

A maquete deve reforçar o conceito de que a inteligência pode sair do software e produzir efeitos físicos.

---

# 38. NFC

Após a experiência:

```text
SESSION
 ↓
SUMMARY
 ↓
URL
 ↓
NFC
```

A experiência poderá ser consultada posteriormente.

A URL não deve expor dados privados de maneira insegura.

---

# 39. AI-Driven Development

## 39.1 Princípio

A IA é copiloto, não autoridade.

Processo:

```text
PROBLEMA
 ↓
COMPORTAMENTO ESPERADO
 ↓
TESTE
 ↓
MUDANÇA PEQUENA
 ↓
TESTE
 ↓
DIFF
 ↓
DECISÃO HUMANA
 ↓
COMMIT
```

## 39.2 Log

Criar:

```text
docs/ai-development-log.md
```

Modelo:

```text
Data:
Problema:
Contexto:
Ferramenta de IA:
Prompt:
Sugestão:
Alteração realizada:
Teste:
Resultado:
Decisão:
Motivo:
Commit:
```

---

# 40. Uso responsável da IA no desenvolvimento

A IA pode:

- explicar;
- sugerir;
- revisar;
- gerar alternativas;
- ajudar a diagnosticar;
- gerar testes;
- auxiliar documentação.

A IA não pode ser tratada como:

- fonte automática de verdade;
- substituta de teste;
- substituta de revisão;
- substituta da decisão humana.

---

# 41. Git/GitHub

Estrutura:

```text
main
develop
feature/ml
feature/dl
feature/nlp
feature/genai
feature/backend
feature/vr
feature/iot
```

Commits recomendados:

```text
feat: implement house classifier
feat: add NLP intent classification
fix: correct profile normalization
test: add classifier evaluation
docs: document prompt strategy
refactor: isolate context engine
```

---

# 42. Estrutura final do repositório

```text
GENJUTSU-AI/
│
├── frontend/
├── backend/
│   ├── api/
│   ├── services/
│   ├── context_engine/
│   └── main.py
│
├── ml/
│   ├── preprocessing/
│   ├── models/
│   ├── training/
│   └── evaluation/
│
├── dl/
│   ├── models/
│   ├── training/
│   └── evaluation/
│
├── nlp/
│   ├── intents/
│   ├── models/
│   └── preprocessing/
│
├── prompts/
│
├── data/
│   ├── raw/
│   ├── processed/
│   └── README.md
│
├── notebooks/
│
├── unity/
│
├── iot/
│   ├── esp32/
│   └── mqtt/
│
├── tests/
│
├── docs/
│   ├── architecture/
│   ├── ai-development/
│   ├── experiments/
│   ├── privacy/
│   └── results/
│
├── evidence/
├── .env.example
├── README.md
└── requirements.txt
```

---

# 43. Testes

## 43.1 Backend

```text
test_user_creation
test_profile_generation
test_house_generation
test_intent_detection
```

## 43.2 ML

```text
test_input_shape
test_prediction_range
test_model_output
```

## 43.3 NLP

```text
test_change_light_intent
test_house_state_intent
test_temperature_intent
```

## 43.4 Integração

Testar:

```text
Frontend → Backend
Backend → ML
Backend → NLP
Backend → LLM
Backend → Database
Backend → MQTT
Unity → Backend
```

---

# 44. Evidências

Criar:

```text
/evidence
```

Subpastas:

```text
dataset/
ml/
dl/
nlp/
genai/
prompt/
api/
unity/
iot/
git/
ai-development/
```

Evidências recomendadas:

```text
dataset.png
eda.png
model_training.png
confusion_matrix.png
metrics.png
nlp_test.png
prompt_comparison.png
api_test.png
unity_test.png
hardware_test.png
git_history.png
ai_development_log.png
```

---

# 45. Matriz de requisitos

| Requisito | Implementação | Evidência |
|---|---|---|
| Problema | Personalização de Smart Home | Documento |
| Dataset | Sintético + experimental | Dataset |
| ML | Classificação | Notebook |
| DL | Rede neural | Notebook |
| Métricas | Accuracy/F1/Precision/Recall etc. | Relatório |
| Gen AI | Corvo | Demo |
| Prompt Engineering | Prompts versionados | `/prompts` |
| NLP | Intents + entidades | API |
| AI-Driven Development | Logs de IA | `/docs` |
| Git/GitHub | Versionamento | Repositório |
| Python | Pipeline | Código |
| TensorFlow/PyTorch | DL | Código |
| Hugging Face | NLP | Código |
| OpenAI API | Gen AI | Backend |
| Smart Home | Casa personalizada | Unity |
| Hardware | ESP32/MQTT | Maquete |

---

# 46. Entregáveis acadêmicos

Documentação sugerida:

```text
01_Introducao
02_Problema
03_Hipotese
04_Dataset
05_Machine_Learning
06_Deep_Learning
07_NLP
08_GenAI
09_Prompt_Engineering
10_AI_Driven_Development
11_Arquitetura
12_Resultados
13_Testes
14_Privacidade
15_Conclusao
```

---

# 47. README

O README deverá conter:

```text
# GenJutsu AI

## Problema
## Objetivo
## Hipótese
## Arquitetura
## Tecnologias
## Dataset
## Machine Learning
## Deep Learning
## NLP
## Gen AI
## Prompt Engineering
## AI-Driven Development
## Como executar
## Resultados
## Testes
## Privacidade
## Equipe
## ExpoTech 2026
```

---

# 48. ADRs — Architecture Decision Records

Cada decisão arquitetural relevante deve possuir um ADR.

Estrutura:

```text
docs/adr/
├── ADR-001-problema.md
├── ADR-002-arquitetura.md
├── ADR-003-dataset.md
├── ADR-004-ml.md
├── ADR-005-dl.md
├── ADR-006-nlp.md
├── ADR-007-genai.md
├── ADR-008-context-engine.md
├── ADR-009-backend.md
├── ADR-010-database.md
├── ADR-011-auth.md
├── ADR-012-unity.md
├── ADR-013-iot.md
└── ADR-014-nfc.md
```

Modelo:

```markdown
# ADR-XXX — Título

## Status
Proposto | Aceito | Rejeitado | Substituído

## Contexto

## Problema

## Opções consideradas

## Decisão

## Justificativa

## Consequências

## Evidências

## Data
```

---

# 49. Matriz de rastreabilidade

Cada requisito deve apontar para:

```text
REQUISITO
 ↓
IMPLEMENTAÇÃO
 ↓
TESTE
 ↓
EVIDÊNCIA
 ↓
DOCUMENTAÇÃO
```

Exemplo:

```text
INTELLIGENCE-NLP-001
 ↓
nlp/intent_classifier.py
 ↓
tests/test_nlp.py
 ↓
evidence/nlp/
 ↓
docs/NLP.md
```

---

# 50. Critério de "pronto"

Uma funcionalidade somente será considerada concluída quando:

```text
[ ] Implementada
[ ] Testada
[ ] Revisada
[ ] Documentada
[ ] Versionada
[ ] Evidência registrada
```

Para ML/DL:

```text
[ ] Dataset definido
[ ] Preprocessamento
[ ] Treinamento
[ ] Validação
[ ] Teste
[ ] Métricas
[ ] Análise
[ ] Modelo versionado
```

Para Gen AI:

```text
[ ] Prompt
[ ] Contexto
[ ] Testes
[ ] Comparação
[ ] Avaliação
[ ] Documentação
```

---

# 51. Plano de execução

## Fase 1 — 21 a 27/09

Fechar:

- problema;
- hipótese;
- arquitetura;
- dataset;
- GitHub;
- ambiente Python;
- Supabase;
- FastAPI;
- modelos;
- intents;
- prompts.

Não priorizar VR nesta fase.

## Fase 2 — 28/09 a 04/10

ML:

```text
dataset
→ cleaning
→ EDA
→ baseline
→ modelos
→ métricas
```

## Fase 3 — 05 a 11/10

Deep Learning:

```text
normalização
→ treino
→ validação
→ avaliação
→ overfitting
```

## Fase 4 — 12 a 18/10

NLP:

```text
texto
→ intent
→ entidades
→ contexto
```

## Fase 5 — 19 a 25/10

Gen AI:

```text
Context Engine
→ Prompt
→ LLM
→ Corvo
```

## Fase 6 — 26/10 a 01/11

Integração:

```text
Web
+
Backend
+
ML
+
DL
+
NLP
+
LLM
+
Unity
```

## Fase 7 — 02 a 08/11

Simulação de banca.

Cada integrante deve conseguir explicar todas as partes.

## 09 a 13/11

Avaliação individual.

Objetivo: defender o projeto e registrar feedback.

## 14 a 27/11

Estabilização, preparação de demonstração, cenografia, maquete, VR, NFC e apresentação.

## 28/11

ExpoTech.

---

# 52. Roteiro final da demonstração

```text
VISITANTE
 ↓
QR CODE
 ↓
LOGIN
 ↓
CONSENTIMENTO
 ↓
PERGUNTAS
 ↓
DATASET
 ↓
ML / DL
 ↓
PERFIL
 ↓
QUEST 3S
 ↓
CORVO
 ↓
NLP
 ↓
CONTEXT ENGINE
 ↓
CASA PERSONALIZADA
 ↓
MAQUETE
 ↓
ESP32 / MQTT
 ↓
RESUMO
 ↓
NFC
```

---

# 53. Demonstração científica

Mostrar dois perfis diferentes.

Exemplo:

```text
VISITANTE A

TECH       0.91
CURIOSITY  0.88
ORDER      0.82
```

Resultado:

```text
LABORATÓRIO
```

Outro:

```text
VISITANTE B

COMFORT    0.93
PRIVACY    0.89
ENERGY     0.32
```

Resultado:

```text
REFÚGIO
```

A demonstração deve mostrar que a experiência muda com o contexto.

---

# 54. Perguntas esperadas da banca

Todos os integrantes devem saber responder:

1. Qual problema vocês resolveram?
2. Qual é a hipótese?
3. Qual é o dataset?
4. De onde vieram os dados?
5. Quantas amostras existem?
6. Quais são as variáveis?
7. Como os dados foram tratados?
8. Qual modelo de ML foi utilizado?
9. Por que esse modelo?
10. Qual foi o baseline?
11. Quais métricas foram utilizadas?
12. Qual foi o resultado?
13. Houve overfitting?
14. Como foi tratado?
15. Onde está o Deep Learning?
16. Onde está o NLP?
17. Onde está a IA Generativa?
18. Onde está Prompt Engineering?
19. Qual foi o papel da IA no desenvolvimento?
20. Como vocês verificaram sugestões da IA?
21. Como o Git foi utilizado?
22. Como os dados são protegidos?
23. O LLM pode executar qualquer comando?
24. Como ocorre a personalização?
25. O modelo é treinado individualmente para cada usuário?

Resposta arquitetural para a última:

> Não. O sistema utiliza um modelo-base e contexto individual. A personalização acontece pela combinação do modelo com perfil, estado, histórico e regras de contexto.

---

# 55. Princípios de decisão do projeto

## P1 — Evidência antes de opinião

Toda decisão técnica importante deve ter justificativa.

## P2 — Experimento antes de complexidade

Primeiro modelo simples, depois complexidade.

## P3 — IA não substitui validação

Toda sugestão gerada por IA precisa ser avaliada.

## P4 — Pequenas mudanças

Evitar alterações gigantes no código.

## P5 — Tudo versionado

Código, prompts, decisões e resultados relevantes devem ser rastreáveis.

## P6 — Dados primeiro

Nenhum modelo deve ser apresentado sem explicar os dados usados.

## P7 — Separação de responsabilidades

```text
ML/DL → sinais preditivos
NLP → interpretação estruturada
Context Engine → integração
Gen AI → linguagem
Unity → experiência
ESP32 → atuação física
```

## P8 — Privacidade por projeto

Coletar somente dados necessários e autorizados.

---

# 56. Definition of Done — Projeto

O GenJutsu será considerado tecnicamente pronto quando:

```text
[ ] Problema documentado
[ ] Hipótese documentada
[ ] Dataset documentado
[ ] Pipeline de dados funcionando
[ ] EDA concluída
[ ] Baseline concluído
[ ] ML treinado
[ ] ML avaliado
[ ] DL treinado
[ ] DL avaliado
[ ] Overfitting analisado
[ ] NLP funcionando
[ ] Intents testados
[ ] Context Engine funcionando
[ ] Prompts versionados
[ ] Prompt Engineering avaliado
[ ] Corvo funcionando
[ ] API funcionando
[ ] Banco funcionando
[ ] Autenticação funcionando
[ ] Consentimento implementado
[ ] Unity integrado
[ ] Quest testado
[ ] MQTT testado, quando aplicável
[ ] ESP32 testado, quando aplicável
[ ] NFC testado
[ ] Testes automatizados
[ ] README completo
[ ] ADRs registrados
[ ] AI Development Log completo
[ ] Evidências organizadas
[ ] GitHub organizado
[ ] Apresentação preparada
[ ] Simulação de banca realizada
```

---

# 57. Definition of Done — ExpoTech

```text
[ ] Sistema inicializa sem intervenção técnica
[ ] Internet disponível
[ ] Backend disponível
[ ] Banco disponível
[ ] API disponível
[ ] Unity inicia
[ ] Quest carregado
[ ] Microfone testado
[ ] Corvo funcionando
[ ] Maquete funcionando
[ ] ESP32 conectado
[ ] MQTT funcionando
[ ] NFC funcionando
[ ] Plano B preparado
[ ] Vídeo de backup preparado
[ ] Demonstração ensaiada
```

---

# 58. Plano de contingência

O projeto deve possuir modo degradado.

Se:

```text
LLM indisponível
```

usar resposta pré-definida.

Se:

```text
MQTT indisponível
```

simular alteração no Unity.

Se:

```text
VR indisponível
```

demonstrar pelo navegador.

Se:

```text
Internet indisponível
```

usar vídeo/demo local preparada.

A demonstração não pode depender de uma única tecnologia.

---

# 59. Controle de mudanças

Antes da avaliação individual:

```text
FEATURE
 ↓
IMPLEMENTAÇÃO
 ↓
TESTE
 ↓
DOCUMENTAÇÃO
 ↓
MERGE
```

Depois da avaliação individual:

> Evitar mudanças conceituais no projeto, respeitando a regra do roteiro da missão.

Correções críticas devem ser:

- pequenas;
- justificadas;
- testadas;
- documentadas.

---

# 60. Estado atual consolidado

## Decisões já tomadas

- nome: GenJutsu AI;
- domínio do problema: Smart Home;
- foco: personalização;
- ML/DL: classificação de perfil/arquétipo;
- NLP: comandos e interpretação;
- Gen AI: Corvo;
- arquitetura: Context Engine;
- backend: FastAPI/Python;
- banco: PostgreSQL/Supabase;
- frontend: Next.js;
- VR: Unity + Meta Quest 3S;
- IoT: ESP32 + MQTT;
- IA: modelo-base + contexto individual;
- autenticação: Google OAuth;
- experiência final: resumo + NFC;
- desenvolvimento: Git/GitHub + AI-Driven Development;
- documentação: CDD + ADRs + evidências.

## Decisões ainda experimentais

- algoritmo final de ML;
- arquitetura final de Deep Learning;
- modelo específico de NLP;
- modelo específico de LLM;
- avaliação definitiva dos prompts;
- quantidade final de dados;
- arquitetura final do hardware;
- detalhes de UX.

Essas decisões devem ser fechadas por experimento, não por preferência.

---

# 61. Registro CDD de decisão

Para cada nova decisão, adicionar:

```markdown
## CDD-XXX — [Título]

### Data
YYYY-MM-DD

### Problema
O que precisa ser resolvido?

### Contexto
Por que isso importa?

### Hipótese
O que esperamos que aconteça?

### Opções
1.
2.
3.

### Experimento
Como vamos testar?

### Resultado
O que aconteceu?

### Evidência
Link/caminho do artefato.

### Decisão
O que foi escolhido?

### Justificativa
Por que?

### Consequências
O que muda no projeto?

### Testes
Quais testes comprovam a decisão?

### Commit
hash

### Responsável
nome
```

---

# 62. Regra final do CDD

Nenhuma decisão importante deverá ser registrada apenas como:

> "A IA recomendou."

A forma correta é:

> "A IA sugeriu X. Foram consideradas as alternativas Y e Z. Foi realizado o experimento W. Os resultados foram A, B e C. Após inspeção humana e validação, X foi adotado."

Isso transforma o uso de IA em **processo de engenharia verificável**.

---

# 63. Resultado esperado

Ao final, o GenJutsu AI deverá demonstrar:

```text
DADO
 ↓
CONHECIMENTO
 ↓
MODELO
 ↓
PREDIÇÃO
 ↓
LINGUAGEM
 ↓
CONTEXTO
 ↓
DECISÃO
 ↓
AÇÃO
 ↓
EXPERIÊNCIA
```

E a equipe deverá ser capaz de provar cada etapa com:

```text
CÓDIGO
+
DADOS
+
MODELOS
+
TESTES
+
MÉTRICAS
+
GIT
+
PROMPTS
+
DOCUMENTAÇÃO
+
DEMONSTRAÇÃO
```

---

# 64. Encerramento

O GenJutsu AI deve ser tratado como um projeto integrado de Engenharia de Software e Inteligência Artificial aplicada.

A experiência visual e o VR são a camada perceptível pelo visitante, mas a sustentação acadêmica está no pipeline:

```text
PROBLEMA
   ↓
DADOS
   ↓
ML / DL
   ↓
NLP
   ↓
CONTEXT ENGINE
   ↓
GEN AI
   ↓
AÇÃO
   ↓
EXPERIÊNCIA
```

O CDD funciona como a memória técnica do projeto: registra **o que foi decidido, por que foi decidido, como foi testado, qual evidência existe e qual decisão humana foi tomada**.

Esse documento deve permanecer versionado no GitHub e ser atualizado durante toda a execução do GenJutsu AI.
