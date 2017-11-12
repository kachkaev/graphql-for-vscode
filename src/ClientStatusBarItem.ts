'use strict';

import {
  StatusBarAlignment,
  window,
  StatusBarItem,
  workspace,
  TextEditor,
  languages,
  TextDocument,
  commands,
  Disposable,
} from 'vscode';

import { LanguageClient, State } from 'vscode-languageclient';

enum Status {
  init = 1,
  ok = 2,
  error = 3,
}

const STATUS_BAR_ITEM_NAME = 'GQL';
const STATUS_BAR_UI = {
  [Status.init]: {
    icon: 'sync',
    color: 'white',
    tooltip: 'Graphql language server is initializing.',
  },
  [Status.ok]: {
    icon: 'plug',
    color: 'while',
    tooltip: 'Graphql language server is running.',
  },
  [Status.error]: {
    icon: 'stop',
    color: 'red',
    tooltip: 'Graphql language server is not running.',
  },
};
export default class ClientStatusBarItem {
  _item: StatusBarItem;
  _client: LanguageClient;
  _disposables: { dispose: () => any }[] = [];

  constructor(client: LanguageClient) {
    this._item = window.createStatusBarItem(StatusBarAlignment.Right, 0);
    this._client = client;

    this._disposables.push(this._item);
    this._disposables.push(this._addOnClickToShowOutputChannel());

    // update status bar depending on client state
    this._setStatus(Status.init);
    this._registerStatusChangeListeners();

    // update visibility of statusBarItem depending on current activeTextEditor
    this._updateVisibility(window.activeTextEditor);
    window.onDidChangeActiveTextEditor(this._updateVisibility);
  }

  dispose() {
    this._disposables.forEach(item => {
      item.dispose();
    });
    this._item = null;
    this._client = null;
  }

  private _registerStatusChangeListeners() {
    this._client.onDidChangeState(({ oldState, newState }) => {
      if (newState === State.Running) {
        this._setStatus(Status.ok);
      } else if (newState === State.Stopped) {
        this._setStatus(Status.error);
      }
    });

    this._client.onReady().then(
      () => {
        this._setStatus(Status.ok);
      },
      () => {
        this._setStatus(Status.error);
      },
    );
  }

  private _addOnClickToShowOutputChannel() {
    const commandName = `showOutputChannel-${this._client.outputChannel.name}`;
    const disposable = commands.registerCommand(commandName, () => {
      this._client.outputChannel.show();
    });
    this._item.command = commandName;
    return disposable;
  }

  private _updateVisibility = (textEditor: TextEditor) => {
    let hide = true;

    if (textEditor && this._checkDocumentInsideWorkspace(textEditor.document)) {
      if (this._client.initializeResult) {
        // if client is initialized than show only for file extensions defined in .gqlconfig
        // @TODO: if possible match against patterns in .gqlconfig instead of extensions.
        const extensions = this._client.initializeResult.fileExtensions;
        const score = languages.match(
          { scheme: 'file', pattern: `**/*.{${extensions.join(',')}}` },
          textEditor.document,
        );
        hide = score === 0;
      } else {
        // while server is initializing show status bar item
        // for all files inside worspace
        hide = false;
      }
    }

    hide ? this._hide() : this._show();
  };

  private _checkDocumentInsideWorkspace(document: TextDocument): boolean {
    const folder = workspace.getWorkspaceFolder(document.uri);
    return folder && folder.uri.toString() === this._getWorkspace();
  }

  private _getWorkspace(): string {
    return this._client.clientOptions.workspaceFolder.uri.toString();
  }

  private _show() {
    this._item.show();
  }

  private _hide() {
    this._item.hide();
  }

  private _setStatus(status: Status) {
    const ui = STATUS_BAR_UI[status];
    this._item.text = `$(${ui.icon}) ${STATUS_BAR_ITEM_NAME}`;
    this._item.tooltip = ui.tooltip;
    this._item.color = ui.color;
  }
}
