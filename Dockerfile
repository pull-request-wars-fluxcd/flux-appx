FROM nginx:stable

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy all static game assets
COPY src/index.html /usr/share/nginx/html/index.html
COPY src/game.js /usr/share/nginx/html/game.js
COPY src/styles.css /usr/share/nginx/html/styles.css

ENTRYPOINT ["/docker-entrypoint.sh"]

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
