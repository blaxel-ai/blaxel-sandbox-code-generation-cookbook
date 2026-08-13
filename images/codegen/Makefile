IMAGE ?= codegen-lifecycle-runtime:local

.PHONY: build test

build:
	docker build -t $(IMAGE) .

test: build
	docker run --rm --entrypoint sh $(IMAGE) -lc 'test "$$(id -u builder)" != 0 && command -v node npm tar unzip'
