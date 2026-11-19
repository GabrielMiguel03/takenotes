# Publicar o NotaControl no Netlify

## Arquivos que devem ir para o Git

Envie o código-fonte, incluindo:

- `src/`
- `public/`
- `netlify/functions/`
- `index.html`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `netlify.toml`
- `tailwind.config.js`
- `postcss.config.js`

Não envie `node_modules/`, `dist/` ou arquivos `.zip` de dependências. O Netlify instala tudo usando o `package-lock.json`.

## Configuração do site

No Netlify, use:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

Depois de cada alteração:

1. Faça commit e push dos arquivos.
2. Aguarde o deploy automático.
3. Abra o site em HTTPS.
4. No celular, use “Adicionar à tela inicial” ou “Instalar aplicativo”.

## Teste rápido após o deploy

1. Abra o site e confirme o manifesto em `/manifest.webmanifest`.
2. Confirme que o Service Worker está ativo.
3. Abra “Nova nota” e teste câmera/OCR.
4. Leia um QR Code de NFC-e.
5. Confira a função em `/.netlify/functions/nfce-proxy?url=...` usando uma URL oficial.
6. Ative o modo avião e confirme que histórico e backup continuam disponíveis.

Os dados financeiros ficam no IndexedDB do dispositivo. O backup JSON deve ser exportado regularmente em Configurações.
