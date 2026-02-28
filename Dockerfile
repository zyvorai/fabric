FROM rust:1.88-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libsystemd-dev \
    libdbus-1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ ./

RUN cargo build --locked --release --bin vmspawnd

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libsystemd0 \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/lib/vmspawnd/images /var/lib/vmspawnd/storage /etc/vmspawnd

COPY --from=builder /build/target/release/vmspawnd /usr/local/bin/
COPY configs/vmspawnd-docker.toml /etc/vmspawnd/vmspawnd.toml

EXPOSE 8080

CMD ["/usr/local/bin/vmspawnd"]
