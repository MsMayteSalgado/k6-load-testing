FROM grafana/k6:latest

WORKDIR /app

COPY script.js .

CMD ["run", "/app/script.js"]
