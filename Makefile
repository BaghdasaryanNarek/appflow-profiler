.DEFAULT_GOAL := help
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

UV ?= uv
API_DIR := apps/api

.PHONY: help ci api-check api-dev contracts web-check dev

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

ci: api-check contracts web-check ## Run the full CI suite locally (mirrors GitHub Actions)
	@echo "✅ make ci passed"

api-check: ## Lint, type-check and test the backend
	cd $(API_DIR) && $(UV) sync --frozen --all-extras
	cd $(API_DIR) && $(UV) run ruff check .
	cd $(API_DIR) && $(UV) run ruff format --check .
	cd $(API_DIR) && $(UV) run mypy --strict src tests
	cd $(API_DIR) && $(UV) run pytest --cov=appflow --cov-fail-under=85 -q

api-dev: ## Run the backend with auto-reload
	cd $(API_DIR) && $(UV) run uvicorn appflow.main:create_app --factory --reload

contracts: ## Regenerate contracts and verify no drift
	@echo "contracts: not yet implemented"

web-check: ## Lint, format-check, type-check, test and build the frontend
	@echo "web-check: not yet implemented"

dev: ## Run backend and frontend in development mode
	@echo "dev: not yet implemented"
