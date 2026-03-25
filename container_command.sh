sudo podman run -it --network host coturn:edge-debian docker-entrypoint.sh --log-file=stdout --external-ip=$(detect-external-ip) -v
