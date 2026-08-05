FROM node:20-alpine

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .
# Geri kalan tüm dosyaları kopyala
# src/app.js, src/db/pool.js vs.
# Neden önce package.json sonra diğerleri?
# Kod değişince npm install tekrar çalışmasın
# Sadece kod kopyalama adımı tekrarlanır


EXPOSE 5001
# Bu container 5001 portunu kullanacak


CMD ["node", "src/app.js"]
# Container başlayınca şu komutu çalıştır diyoruz