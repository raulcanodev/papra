# @paqui/tool-catalog

The single source of truth of the tools Paqui exposes to AI clients. A tool is defined once here (name, description for the model, zod input, risk level, API key permission, and what it does through the Paqui REST API) and consumed by two transports:

- **MCP server** (`@paqui/mcp-server`): registers every tool, runs it over HTTP with an API key. The risk becomes MCP annotations.
- **In-app assistant** (`apps/paqui-server`, `ai-assistant/tools/catalog-tools.ts`): runs it in-process with the user's own session. `read` tools run immediately, `write` and `destructive` tools become approval cards.

Because both go through the REST API, every rule (membership, validation, numbering, Verifactu) lives in one place, and a tool added here shows up in both.

## Adding a tool

1. Create or extend a module in `src/domains` with `defineOrganizationTool` (or `defineGlobalTool`). Do not declare `organizationId`: the transport supplies it.
2. Take and return human units (euros, percentages, quantities); convert at the edge with `src/units.ts`.
3. Choose the `risk` honestly: anything irreversible or that sends something outside (issuing an invoice, emailing) is `destructive`.
4. Name the `permission` an API key needs, and open the matching route with `requireAuthentication({ apiKeyPermissions: [...] })`.
5. Register it in `src/catalog.ts`, run `pnpm test` and `pnpm docs` to refresh the table below.

## Tools

<!-- tools:start -->

| Tool | Risk | API key permission | What it does |
| --- | --- | --- | --- |
| `list_organizations` | read | `organizations:read` | List the Paqui organizations (workspaces) accessible to the current user or API key. |
| `get_organization` | read | `organizations:read` | Get the current organization: name and metadata. |
| `search_workspace` | read | `organizations:read` | Deep search across the whole workspace at once: contacts (by name, tax ID, email, city, notes), issued invoices (number, customer, notes, line descriptions), received invoices (number, supplier, line descriptions), products (name, description) and documents (name, content). |
| `list_documents` | read | `documents:read` | Search and page through the documents of the organization by name or extracted content. |
| `get_document` | read | `documents:read` | Get a document with its metadata, tags and extracted text content. |
| `get_document_statistics` | read | `documents:read` | Document counts and storage usage of the organization. |
| `update_document` | write | `documents:update` | Rename a document, change its text content or its document date. |
| `list_tags` | read | `tags:read` | List all the tags of the organization with their IDs. |
| `create_tag` | write | `tags:create` | Create a tag. |
| `add_tag_to_document` | write | `documents:update` | Attach an existing tag to a document. |
| `remove_tag_from_document` | destructive | `documents:update` | Detach a tag from a document. |
| `list_contacts` | read | `contacts:read` | List the address book of the organization. |
| `get_contact` | read | `contacts:read` | Get one contact with all its fiscal and contact data and its custom properties. |
| `create_contact` | write | `contacts:create` | Create a customer, supplier and/or sales representative. |
| `update_contact` | write | `contacts:update` | Change some fields of a contact. |
| `delete_contact` | destructive | `contacts:delete` | Archive a contact: it disappears from the address book but the invoices already issued to or from it are kept intact. |
| `list_products` | read | `products:read` | List the catalog of products and services that can be put on an invoice. |
| `create_product` | write | `products:create` | Add a product or service to the catalog. |
| `update_product` | write | `products:update` | Change some fields of a product. |
| `delete_product` | destructive | `products:delete` | Archive a product: it leaves the catalog, existing invoices keep their lines. |
| `list_tax_rates` | read | `products:read` | List the VAT rates available when invoicing (e.g. |
| `create_tax_rate` | write | `products:create` | Add a tax rate. |
| `update_tax_rate` | write | `products:update` | Change the name, the rate or the default flag of a tax rate. |
| `delete_tax_rate` | destructive | `products:delete` | Archive a tax rate so it is no longer offered. |
| `list_invoices` | read | `invoices:read` | List issued-by-us invoices (facturas emitidas), newest first, with the customer name. |
| `get_invoice` | read | `invoices:read` | Get one invoice with its lines, customer, totals inputs and status. |
| `list_invoice_series` | read | `invoices:read` | List the numbering series (e.g. |
| `create_invoice_draft` | write | `invoices:create` | Create a DRAFT invoice. |
| `update_invoice_draft` | write | `invoices:update` | Change a DRAFT invoice. |
| `delete_draft_invoice` | destructive | `invoices:delete` | Delete an invoice that is still a draft. |
| `issue_invoice` | destructive | `invoices:update` | Make a draft FINAL: it gets the next number of its series, is archived as a PDF and registered for Verifactu when enabled. |
| `send_invoice_email` | destructive | `invoices:update` | Email the invoice PDF to the customer (issues it first if it is still a draft). |
| `mark_invoice_paid` | write | `invoices:update` | Record that the customer has paid an issued invoice. |
| `list_purchase_invoices` | read | `purchases:read` | List invoices RECEIVED from suppliers (facturas recibidas / gastos), newest first. |
| `get_purchase_invoice` | read | `purchases:read` | Get one received invoice with its lines and supplier. |
| `extract_purchase_from_document` | read | `purchases:create` | Use AI to read an uploaded PDF/image of a supplier invoice and return a prefilled draft (supplier, number, dates, lines, category). |
| `create_purchase_invoice` | write | `purchases:create` | Register an invoice received from a supplier (a deductible expense). |
| `update_purchase_invoice` | write | `purchases:update` | Change some fields of a received invoice. |
| `set_purchase_invoice_status` | write | `purchases:update` | Mark a received invoice as paid, or back to pending. |
| `delete_purchase_invoice` | destructive | `purchases:delete` | Permanently delete a received invoice. |
| `get_fiscal_profile` | read | `invoices:read` | Get the fiscal identity of the organization: legal name, NIF, address, legal form (autónomo or sociedad), VAT regime, income tax method, default IRPF withholding and accountant email. |
| `update_fiscal_profile` | write | `invoices:update` | Change fiscal data of the organization. |
| `get_quarterly_taxes` | read | `taxes:read` | Estimate the Spanish quarterly taxes of the organization from its issued and received invoices: IVA (modelo 303), IRPF instalment (130), withholdings (111, 115) or corporate tax instalment (202), with the filing deadline. |
| `get_calendar` | read | `calendar:read` | Read the fiscal calendar of the organization for a year: Spanish tax filing deadlines published by the AEAT (fetched live, so they are current) and the public holidays of the region set in the fiscal profile. |
| `get_spanish_tax_reference` | read | — | Orientation map of Spanish taxes and invoicing: IVA, IRPF for autónomos, retenciones, impuesto de sociedades, calendar of models, invoice rules, Verifactu, Seguridad Social, deductible expenses, EU operations, record keeping. |

<!-- tools:end -->
