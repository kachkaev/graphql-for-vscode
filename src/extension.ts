'use strict';

import * as path from 'path';
import {
  commands,
  ExtensionContext,
  StatusBarAlignment,
  TextEditor,
  window,
  TextDocument,
  workspace as Workspace,
  WorkspaceFolder,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  NotificationType,
  ServerOptions,
  State as ClientState,
  TransportKind,
} from 'vscode-languageclient';

import ClientStatusBarItem from './ClientStatusBarItem';
import { findConfigFile as findGQLConfigFile } from '@playlyfe/gql-language-server';

const EXT_NAME = 'graphqlForVSCode';
const GQL_LANGUAGE_SERVER_CLI_PATH = require.resolve(
  '@playlyfe/gql-language-server/lib/bin/cli',
);

interface Client {
  dispose: () => any;
  statusBarItem: ClientStatusBarItem;
  client: LanguageClient;
}

const clients: Map<string, Client | null> = new Map();
let activeStatusBarItem: ClientStatusBarItem = null;

export function activate(context: ExtensionContext) {
  createClientForWorkspaces();
  // update clients when workspaceFolderChanges
  Workspace.onDidChangeWorkspaceFolders(createClientForWorkspaces);
}

export function deactivate(): Thenable<void> {
  let promises: Thenable<void>[] = [];
  clients.forEach(client => {
    promises.push(client.dispose());
  });
  return Promise.all(promises).then(() => undefined);
}

function createClientForWorkspaces() {
  const workspaceFolders = Workspace.workspaceFolders || [];
  const workspaceFoldersIndex = {};

  workspaceFolders.forEach(folder => {
    const key = folder.uri.toString();
    if (!clients.has(key)) {
      const client = createClientForWorkspace(folder);
      console.log('adding client', key, client);
      clients.set(key, client);
    }
    workspaceFoldersIndex[key] = true;
  });

  // remove clients for removed workspace folders
  clients.forEach((client, key) => {
    // remove client
    if (!workspaceFoldersIndex[key]) {
      console.log('deleting client', key);
      clients.delete(key);
      if (client) {
        client.dispose();
      }
    }
  });
}

function createClientForWorkspace(folder: WorkspaceFolder): null | Client {
  // per workspacefolder settings
  const configuration = Workspace.getConfiguration(EXT_NAME, folder.uri);
  // console.log(Workspace.getConfiguration(EXT_NAME));
  // console.log(configuration);
  // console.log(configuration.get('watchman'));

  // only create client if .gqlconfig present
  if (!findGQLConfigFile.silent(path.join(folder.uri.fsPath))) {
    return null;
  }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: {
      module: GQL_LANGUAGE_SERVER_CLI_PATH,
      transport: TransportKind.ipc,
      args: [
        configuration.has('watchman')
          ? `--watchman=${configuration.get('watchman')}`
          : null,
        configuration.has('autoDownloadGQL')
          ? `--auto-download-gql=${configuration.get('autoDownloadGQL')}`
          : null,
      ].filter(Boolean),
    },
    debug: {
      module: GQL_LANGUAGE_SERVER_CLI_PATH,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--debug=6004'],
      },
    },
  };

  const outputChannel = window.createOutputChannel(`Graphql-${folder.name}`);

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    diagnosticCollectionName: 'graphql',
    initializationOptions: () => {
      return {
        nodePath: configuration
          ? configuration.get('nodePath', undefined)
          : undefined,
        debug: configuration ? configuration.get('debug', false) : false,
      };
    },
    initializationFailedHandler: error => {
      // window.showErrorMessage(
      //   `graphql-for-vscode couldn't start for workspace folder '${folder.name}'. See output channel '${outputChannel.name}' for more details.`,
      // );
      client.error('Server initialization failed:', error.message);
      client.outputChannel.show(true);
      // avoid retries
      return false;
    },
    outputChannel: outputChannel,
    workspaceFolder: folder,
  };

  // Create the language client and start the client.
  const client = new LanguageClient(
    'Graphql For VSCode',
    serverOptions,
    clientOptions,
  );

  const statusBarItem = new ClientStatusBarItem(client);

  const subscriptions = [
    client.start(),
    {
      dispose() {
        outputChannel.hide();
        outputChannel.dispose();
      },
    },
    statusBarItem,
  ];

  return {
    dispose: () => {
      subscriptions.forEach(subscription => {
        subscription.dispose();
      });
    },
    statusBarItem,
    client,
  };
}
