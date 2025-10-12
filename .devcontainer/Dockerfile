FROM node:22-slim

RUN apt-get update && apt-get install -y git iptables && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex

WORKDIR /workspace

ENTRYPOINT ["bash"]
CMD ["bash"]
