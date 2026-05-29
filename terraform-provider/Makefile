.PHONY: build install tidy test

PROVIDER_NAME := terraform-provider-vmspawnd
VERSION ?= 0.1.0

build:
	go build -o $(PROVIDER_NAME) .

tidy:
	go mod tidy

install: build
	mkdir -p ~/.terraform.d/plugins/registry.terraform.io/ssahani/vmspawnd/$(VERSION)/$$(go env GOOS)_$$(go env GOARCH)
	cp $(PROVIDER_NAME) ~/.terraform.d/plugins/registry.terraform.io/ssahani/vmspawnd/$(VERSION)/$$(go env GOOS)_$$(go env GOARCH)/$(PROVIDER_NAME)_v$(VERSION)

test:
	go test ./...
