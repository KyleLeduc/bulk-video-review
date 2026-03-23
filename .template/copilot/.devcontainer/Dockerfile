FROM node:22-slim

ARG STRUCTURIZR_CLI_VERSION=2025.11.09

# Base packages:
# - git/ca-certificates: baseline repo and HTTPS access
# - curl/unzip: download and unpack the Structurizr CLI release archive
# - graphviz: render DOT exports into PNG diagrams
# - plantuml: keep PlantUML export options available for future use
# - iptables: retained from the working devcontainer because some nested dev flows rely on it
RUN apt-get update \
  && apt-get install -y git iptables curl unzip ca-certificates graphviz plantuml \
  && rm -rf /var/lib/apt/lists/*

# Install Structurizr CLI into a versioned directory so upgrades stay explicit.
RUN curl -fL "https://github.com/structurizr/cli/releases/download/v${STRUCTURIZR_CLI_VERSION}/structurizr-cli.zip" -o /tmp/structurizr-cli.zip \
  && mkdir -p /opt/structurizr/structurizr-cli-${STRUCTURIZR_CLI_VERSION} \
  && unzip /tmp/structurizr-cli.zip -d /opt/structurizr/structurizr-cli-${STRUCTURIZR_CLI_VERSION} \
  && chmod +x /opt/structurizr/structurizr-cli-${STRUCTURIZR_CLI_VERSION}/structurizr.sh \
  && ln -sf /opt/structurizr/structurizr-cli-${STRUCTURIZR_CLI_VERSION}/structurizr.sh /usr/local/bin/structurizr \
  && ln -sf /opt/structurizr/structurizr-cli-${STRUCTURIZR_CLI_VERSION}/structurizr.sh /usr/local/bin/structurizr.sh \
  && rm /tmp/structurizr-cli.zip

ENV STRUCTURIZR_CLI=/usr/local/bin/structurizr
ENV STRUCTURIZR_CLI_JAR=/opt/structurizr/structurizr-cli-${STRUCTURIZR_CLI_VERSION}/structurizr-cli-${STRUCTURIZR_CLI_VERSION}.jar

WORKDIR /workspace

ENTRYPOINT ["bash"]
CMD ["bash"]
