FROM eclipse-temurin:21-jdk-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      gcc \
      g++ \
      nodejs \
      coreutils \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -u 10001 -m -s /usr/sbin/nologin student \
    && mkdir -p /workspace/src \
    && chown -R student:student /workspace

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY node-interactive-preload.cjs /usr/local/lib/node-interactive-preload.cjs
RUN chmod +x /usr/local/bin/entrypoint.sh

USER student
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
