# Paqui CLI

The Paqui CLI is a command-line interface tool that helps you interact with the Paqui platform from your terminal.

## Installation

For the moment, the CLI is only available as an NPM package.

```bash
# using pnpm
pnpm i -g @paqui/cli

# or using npm
npm i -g @paqui/cli

# or using yarn
yarn add -g @paqui/cli
```

The CLI will be installed globally, so you can use it from anywhere in your system with the `paqui` command.

## Configuration

Before using the CLI, you need to configure it with your API credentials.

### Initial Setup

To initialize the configuration, run:

```bash
paqui config init
```

This command will prompt you for:
- **Instance URL**: Your Paqui instance URL (e.g., `https://api.heypaqui.com`)
- **API Key**: Your personal API key (can be created in your User Settings)

### Managing Configuration

You can manage your configuration using the following commands:

- `paqui config list`: View your current configuration
- `paqui config set api-key`: Set or update your API key
- `paqui config set api-url`: Set or update your instance URL
- `paqui config set default-org-id`: Set a default organization ID

### Organization IDs

Since Paqui supports multiple organizations, you may need to specify the organization ID when importing documents for example. If want, you can set a default organization ID in your configuration.

```bash
paqui config set default-org-id <organization-id>
paqui documents import <file-path>

# or
paqui documents import -o <organization-id> <file-path>
```

## Available Commands

### Importing documents

The `import` command allows you to import a document into your Paqui organization.

```bash
paqui documents import -o <organization-id> <file-path>
```

## Getting Help

For more information about any command, you can use the `--help` flag:

```bash
paqui --help
paqui config --help
paqui documents --help
```

## About the CLI

The CLI is built using the [citty](https://github.com/unjs/citty) framework and the [Paqui TS SDK](https://github.com/raulcanodev/papra/tree/main/packages/api-sdk).
