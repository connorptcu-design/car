#!/bin/sh
# Usage: ./new-client.sh "Thompson Wealth Partners"
# Creates a private workspace folder with an unguessable name.
NAME="$1"
[ -z "$NAME" ] && echo "Usage: ./new-client.sh \"Client Name\"" && exit 1
SLUG=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')
mkdir -p "c/$SLUG"
sed "s/CLIENT_NAME/$NAME/" c/_template.html > "c/$SLUG/index.html"
echo ""
echo "Created workspace for: $NAME"
echo "Send them:  https://YOURDOMAIN.com/c/$SLUG/"
echo ""
