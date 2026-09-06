# Petal Reader local patches

Upstream: `johnfactotum/foliate-js`  
Pinned commit: `78914aef4466eb960965702401634c2cb348e9b1`

## `paginator.js`

The three built-in touch-swipe handlers return immediately unless the paginator
has a `swipe` attribute. Petal Reader does not add that attribute in v1 and
implements short tap zones itself.

Reason: foliate-js issue #86 documents iOS selection-handle drags being
interpreted as page swipes. Text selection has higher priority than navigation
in Petal Reader.
