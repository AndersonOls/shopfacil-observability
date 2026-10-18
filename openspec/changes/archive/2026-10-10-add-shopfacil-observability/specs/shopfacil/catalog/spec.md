# Spec Delta

## Purpose

Provide read access to the product catalog used by the storefront and the
checkout flow.

## ADDED Requirements

### Requirement: List products

The catalog SHALL return the available products via `GET /products`, each with
at least an id, name, and price.

#### Scenario: List returns products

- **WHEN** a client calls `GET /products`
- **THEN** the catalog responds 200 with the list of products

### Requirement: Search products

The catalog SHALL filter products via `GET /products?q=<term>`, matching the name
case-insensitively.

#### Scenario: Search matches

- **WHEN** a client calls `GET /products?q=mouse`
- **THEN** the catalog returns only products whose name matches "mouse"

#### Scenario: Search with no matches

- **WHEN** a client searches a term that matches no product
- **THEN** the catalog responds 200 with an empty list

### Requirement: Product lookup by id

The catalog SHALL return a single product via `GET /products/:id` and SHALL
respond 404 when the id does not exist.

#### Scenario: Unknown product

- **WHEN** a client calls `GET /products/:id` with an unknown id
- **THEN** the catalog responds 404
