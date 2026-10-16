# Paqui API SDK

This is a JS/TS SDK for the Paqui API.
[Paqui](https://heypaqui.com) is an open-source self-hostable document archiving platform.

# Prerequisites

To use the SDK, you need to have an API key. You can create one in your user settings (under /api-keys).

## Installation

```bash
pnpm install @paqui/api-sdk
# or
npm install @paqui/api-sdk
# or
yarn add @paqui/api-sdk
```

## Usage

```ts
import { createClient } from '@paqui/api-sdk';

const client = createClient({
  // The API key can be found in your user settings (under /api-keys)
  // you may want to store this in an environment variable
  apiKey: 'ppapi_...',

  // Optional: base URL of the API
  apiBaseUrl: 'http://paqui.your-instance.tld',
});

const myFile = new File(['test'], 'test.txt', { type: 'text/plain' });

await client.uploadDocument({
  file: myFile,
  organizationId: 'org_...', // The id of the organization you want to upload the document to
});
```

You can also scope the client to a specific organization:

```ts
const client = createClient({ apiKey, apiBaseUrl }).forOrganization('org_...');

await client.uploadDocument({ file });
```

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](./LICENSE) file for details.

## Credits

This project is crafted with ❤️ by [Corentin Thomasset](https://corentin.tech).
If you find this project helpful, please consider [supporting my work](https://buymeacoffee.com/cthmsst).
