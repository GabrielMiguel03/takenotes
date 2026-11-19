# TakeNotes — Implementação realizada

## 1. Visão geral

O TakeNotes é uma aplicação web responsiva com suporte a PWA para registrar e organizar compras a partir de notas fiscais. O projeto começou como uma interface frontend e recebeu uma camada de autenticação com Supabase, persistência local, integração com Netlify Functions e suporte à instalação em dispositivos móveis.

O endereço atual de publicação é:

```text
https://takenotesprot.netlify.app
```

## 2. Stack utilizada

- Vite
- React
- TypeScript
- Tailwind CSS
- PWA com `vite-plugin-pwa` e Workbox
- Supabase Auth (e-mail e senha)
- Supabase PostgreSQL/RLS preparado pelo arquivo `supabase/schema.sql`
- Dexie/IndexedDB para dados locais
- Netlify Functions
- `html5-qrcode` para leitura de QR Code
- Tesseract.js para OCR em português
- Lucide React para ícones

## 3. Identidade do aplicativo

O nome visível do aplicativo é **TakeNotes**.

Atualizado em:

- Título do navegador
- Nome curto e nome completo do manifesto PWA
- Tela de autenticação
- Marca da aplicação
- Cabeçalho interno
- Tela de instalação
- Nome do arquivo de backup

Nomes técnicos antigos como chaves internas do IndexedDB e localStorage foram mantidos para evitar perda de dados já salvos no navegador.

## 4. PWA e instalação mobile

O aplicativo possui:

- Manifesto web configurado
- Ícones PWA de 192px e 512px
- Modo standalone
- Orientação preferencial vertical
- Atualização automática do Service Worker
- Cache de assets estáticos
- Fallback de navegação para `index.html`
- Detecção do evento `beforeinstallprompt`
- Botão de instalação no cabeçalho
- Instruções específicas para Android e iPhone
- Layout responsivo para celular, tablet e computador
- Menu lateral convertido em menu móvel no celular

No Android, a instalação pode ser feita pelo menu do navegador. No iPhone, é necessário usar **Compartilhar → Adicionar à Tela de Início**.

## 5. Autenticação com Supabase

Autenticação implementada com e-mail e senha via API HTTP do Supabase.

Funcionalidades:

- Criar conta com e-mail válido e senha (mínimo 6 caracteres)
- Validação de e-mail em tempo real com feedback visual
- Validação de senha com feedback visual
- Campo mostrar/ocultar senha
- Submissão com Enter em qualquer campo
- Entrar com e-mail e senha
- Manter a sessão no navegador
- Sair da conta pela tela de perfil
- Mensagem quando o backend não está configurado
- Erros do Supabase traduzidos automaticamente para português

> Login com Google foi removido por instabilidade de configuração no OAuth.

### Variáveis do Netlify

As variáveis devem ser configuradas no painel do Netlify, nunca no Git:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Chaves secretas do Supabase não devem ser enviadas para o GitHub ou para o frontend.

## 6. Banco de dados Supabase

O arquivo `supabase/schema.sql` foi criado para preparar:

- Perfis de usuário
- Métodos de pagamento
- Categorias
- Notas fiscais
- Itens das notas
- Metas e limites
- Políticas de segurança RLS
- Trigger para criação de perfil após cadastro

O SQL precisa ser executado no SQL Editor do projeto Supabase.

## 7. Persistência local

O app utiliza Dexie sobre IndexedDB para guardar localmente:

- Compras
- Itens das compras
- Categorias
- Formas de pagamento
- Backup e restauração

Também existem dados locais para:

- Preferência de tema
- Nome de perfil no dispositivo
- Sessão de autenticação
- Metas criadas na aplicação

O backup pode ser exportado em JSON e restaurado pela tela de configurações. Também existe suporte interno para exportação CSV das compras.

## 8. Carteira

A seção Carteira foi implementada com cadastro de:

- Cartão de crédito
- Cartão de débito
- Vale-alimentação
- Pix/conta
- Dinheiro

Cada forma de pagamento pode ser adicionada e removida. Os métodos aparecem na tela de registro da nota.

## 9. Categorias

O aplicativo possui categorias padrão para:

- Alimentação e mercado
- Saúde e farmácia
- Transporte e combustível
- Casa e limpeza
- Higiene e cuidados pessoais
- Lazer e restaurantes
- Outros

Também é possível adicionar categorias personalizadas e informar um limite mensal.

## 10. Metas e limites

A tela de Metas permite:

- Criar uma meta
- Informar o limite em reais
- Associar a meta a uma categoria
- Exibir valor utilizado
- Exibir percentual de utilização
- Remover uma meta

As metas são persistidas localmente no navegador.

## 11. Registro de notas

O registro de nota possui três modos:

### QR Code

- Abre a câmera traseira do dispositivo
- Lê o QR Code da NFC-e
- Guarda o link capturado
- Consulta a página da SEFAZ através de uma Netlify Function
- Mantém o usuário na tela quando a consulta falha ou demora

**Quando a SEFAZ bloqueia (CAPTCHA ou bloqueio de servidor):**

O app exibe um painel com quatro opções em ordem de facilidade:

1. **Recomendado (leigos):** Abre a nota diretamente no navegador do sistema → usuário resolve CAPTCHA → tira um print da tela → volta ao app e seleciona o print → OCR lê automaticamente os itens.
2. **Foto da nota em papel:** Fotografa a nota impressa diretamente com o OCR.
3. **Preencher manualmente:** Digita os dados à mão.
4. **Colar texto (avançado):** Para usuários de desktop — abre a URL, copia todo o texto da página (Ctrl+A → Ctrl+C) e cola no app para processamento automático.

### Foto/OCR

- Permite selecionar ou fotografar uma nota
- Processa a imagem localmente
- Usa idioma português no Tesseract.js
- Amplia e melhora o contraste da imagem
- Tenta identificar estabelecimento, total e itens
- Separa nome e preço do produto
- Remove linhas de total, troco, desconto e pagamento
- Remove itens duplicados

### Manual

Permite preencher:

- Estabelecimento
- Total da nota
- Forma de pagamento
- Nome do produto
- Preço do produto

## 12. Classificação automática de produtos

Os itens reconhecidos são classificados automaticamente por palavras-chave:

- Feijão, arroz, leite e carne → Alimentação
- Pasta de dente, sabonete e shampoo → Higiene
- Detergente, sabão e desinfetante → Casa
- Remédio e vitamina → Saúde
- Gasolina e etanol → Transporte
- Pizza, restaurante e chocolate → Lazer
- Itens não reconhecidos → Outros

O usuário ainda pode revisar os itens e seus valores antes de salvar a compra.

## 13. Consulta das NFC-e

Arquivo: `netlify/functions/nfce-proxy.ts`

A função:

- Recebe uma URL de NFC-e
- Valida o domínio antes da requisição (todos os estados brasileiros)
- Envia headers realistas de browser Chrome Mobile para evitar bloqueios simples
- Segue redirects automaticamente
- Usa timeout de 15s
- Retorna o HTML para o parser da aplicação
- Evita cache de respostas

### Parser de HTML (3 estratégias em cascata)

**Estratégia 1 — Tabela HTML**
Detecta colunas por header (nome, qtd, valor unitário, total). Funciona para AM, CE, MG, RS, SP e outros estados que usam `<table>`.

**Estratégia 2 — Divs e spans com classes semânticas**
Selectors como `[class*="prod"]`, `[class*="item"]`. Funciona para estados com layout div-based.

**Estratégia 3 — Texto puro (fallback)**
Parseia o `textContent` completo. Usado também pelo OCR e pelo modo de colar texto. Remove código de barras, quantidades, unidades, CST, ICMS, NCM, CFOP e outros campos técnicos.

## 14. Tema e responsividade

Foram implementados:

- Tema claro (padrão)
- Tema escuro persistido via classe `dark` no `<html>`
- `color-scheme: dark` no CSS para elementos nativos do browser
- Paleta `brand` completa (tons 50 a 950)
- Classes `dark:` do Tailwind aplicadas em todos os componentes
- Menu lateral no desktop
- Menu móvel no celular
- Cartões e formulários adaptáveis
- Grids que reorganizam campos em telas pequenas
- Botões e entradas com tamanho adequado para toque

## 15. Notificações e perfil

O sino de notificações abre uma janela própria, sem opção de logout.

A opção **Sair da conta** aparece somente no modal de perfil.

A instalação do aplicativo também possui uma janela própria, sem logout, com instruções para Android e iPhone.

## 16. Deploy no Netlify

O projeto possui configuração em `netlify.toml` com:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
Redirect SPA: /* → /index.html (status 200)
```

O Netlify instala automaticamente as dependências usando:

- `package.json`
- `package-lock.json`

Não é necessário enviar `node_modules` ou `dist` para o GitHub.

## 17. Arquivos principais

- `src/AppV2.tsx` — tela principal e navegação
- `src/components/AuthGate.tsx` — autenticação (e-mail/senha, sem Google)
- `src/services/cloudAuth.ts` — integração com Supabase Auth
- `src/components/QrScanner.tsx` — câmera, QR Code e fluxo de fallback SEFAZ
- `src/components/OcrPicker.tsx` — foto e OCR
- `src/services/nfceParser.ts` — parser HTML/texto com 3 estratégias
- `src/services/nfceClient.ts` — consulta à função da NFC-e
- `src/db.ts` — banco local Dexie
- `src/types.ts` — tipos da aplicação
- `netlify/functions/nfce-proxy.ts` — proxy seguro para NFC-e
- `supabase/schema.sql` — estrutura do banco Supabase
- `vite.config.ts` — configuração do Vite e PWA
- `netlify.toml` — configuração de build, funções e redirects
- `tailwind.config.js` — paleta brand completa (50–950)
- `src/index.css` — base CSS com suporte a `color-scheme`

## 18. Validações realizadas

Corrigidos e verificados:

- Wrapper de tema escuro removido do JSX (classe `dark` fica apenas no `<html>`)
- `color-scheme: dark` aplicado ao `html.dark` via CSS
- Paleta `brand` expandida para incluir todos os tons usados no JSX
- Exportação de `signInWithGoogle` removida (não utilizada)
- Tipagem de `KeyboardEvent` importada explicitamente do React
- Regex de dinheiro sem estado global (evita bugs com flag `g` em variável compartilhada)
- Redirect SPA adicionado ao `netlify.toml`
- `AbortSignal.timeout` no fetch do cliente para evitar travamento

## 19. Arquivos que não devem ser enviados ao Git

Não enviar:

- `node_modules`
- `dist`
- `.env`
- Chaves secretas do Supabase

O `.gitignore` deve impedir o envio desses arquivos.

## 20. Limitações conhecidas

- A consulta de NFC-e depende dos portais estaduais da SEFAZ.
- Algumas SEFAZ bloqueiam proxies, automações ou requisições externas — o fluxo de fallback com print + OCR foi implementado para esse caso.
- Não é possível ler o DOM de uma aba aberta em outro domínio (Same-Origin Policy do browser) — essa é uma restrição de segurança fundamental que vale para todos os PWAs, sem exceção.
- O OCR depende da qualidade da fotografia ou do print.
- As compras, categorias, carteira e metas ainda utilizam persistência local no navegador; a sincronização completa desses registros com as tabelas do Supabase ainda é uma etapa futura.

## 21. Processo de publicação

```bash
git add -A
git commit -m "feat: tema dark/light, auth simplificada, parser NFC-e robusto, fallback SEFAZ"
git push
```

Após o push:

1. Aguardar o deploy automático do Netlify aparecer como `Published`.
2. Testar login com e-mail e senha.
3. Testar carteira, categorias e metas.
4. Testar registro manual.
5. Testar foto/OCR com uma nota bem iluminada.
6. Testar QR Code — confirmar que quando a SEFAZ bloqueia aparece o painel de opções com o fluxo recomendado.
7. Testar instalação no Android e no iPhone.
