> NOTE: this readme is currently _aspirational_, lots of this stuff doesn't
> work yet, but I'd like it to!

[[Autowiki]] is a tool for creating networked documents. Autowiki is a [local-first](https://www.inkandswitch.com/local-first.html) app: you own all the data you put into it, and your data never leaves your own machine unless you want it to.

### Try it out

Visit [$WEBSITE](https://web.site) to start editing right away in your browser. To back up your data, run a [replication peer](#replicationpeer). Replication peers can optionally publish a read-only version of your wiki.

## Data Model

Autowiki thinks of a wiki as a single document with many interlinked pages. All your data is stored locally, and optionally [replicated](#replicationpeer) to one or more remote sites. You can connect multiple editors to a replication peer, and edits will be synchronized automatically when they connect to the peer. Autowiki uses [automerge](https://github.com/automerge/automerge) under the hood to resolve edit conflicts automatically.

## Replication Peer

Browsers are not designed for resilient storage, so Autowiki provides the ability to live-backup your data as you type. Replication peers also allow you to edit the same wiki from multiple documents, and keep all your changes synchronized.

To run a replication peer, you can use the `@autowiki/replication-peer` npm package:

```
$ npx @autowiki/replication-peer
Listening on 0.0.0.0:3030...
Secret: 202a20cd-059c-4ef9-a7ce-3f2aecef17f8
```

To connect the Autowiki editor to the replication peer, enter its publicly-reachable address along with the secret. For instance, if your server is hosted at `my.server.net`, and the replication peer is listening on port 3030, enter `202a20cd-059c-4ef9-a7ce-3f2aecef17f8@my.server.net:3030` as the replication peer address.

### Publishing

Optionally, the replication peer can also publish a read-only copy of your wiki. To publish a wiki, pass the `--publish` option to `@autowiki/replication-peer`:

```
$ npx @autowiki/replication-peer --publish
```

The replication peer will publish the read-only version on the same port it listens for changes.
