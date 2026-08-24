# Runtime image for the Java GUI Workspace. Renders a student's Swing/AWT
# program onto a virtual X11 display and serves it to the browser over
# VNC-over-WebSocket. See C:\Users\Carlos\.claude\plans\shimmering-dreaming-widget.md
# section 3 for the full design rationale.
FROM eclipse-temurin:21-jdk-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb \
      fluxbox \
      x11vnc \
      websockify \
      novnc \
      procps \
    && rm -rf /var/lib/apt/lists/*

# Non-root, matches the `securityContext.runAsUser` set by both the Docker
# (local) and Kubernetes (prod) container admins — nothing in this image
# needs root at runtime.
RUN useradd -u 10001 -m -s /usr/sbin/nologin student \
    && mkdir -p /workspace/src \
    && chown -R student:student /workspace

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER student
WORKDIR /workspace

EXPOSE 6080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
