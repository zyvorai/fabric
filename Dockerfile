FROM rust:1.88-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libsystemd-dev \
    libdbus-1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ ./

RUN cargo build --locked --release --bin zyvor-fabricd

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libsystemd0 \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/lib/zyvor-fabricd/images /var/lib/zyvor-fabricd/storage /etc/zyvor-fabricd

COPY --from=builder /build/target/release/zyvor-fabricd /usr/local/bin/
COPY configs/zyvor-fabricd-docker.toml /etc/zyvor-fabricd/zyvor-fabricd.toml

EXPOSE 9095

CMD ["/usr/local/bin/zyvor-fabricd"]
