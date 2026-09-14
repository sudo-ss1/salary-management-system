#!/bin/sh
# Starts nginx and the JVM in one container. See deploy/nginx.conf for why
# they share one.
set -eu

# --- Database -------------------------------------------------------------
# Every platform that provisions Postgres for you hands it over as a single
# libpq URL: postgres://user:password@host:port/database. Spring wants a JDBC
# URL plus separate credentials. Split it here so whoever deploys this sets
# one variable, not three - and so a copy-paste mistake across three fields
# cannot happen at all.
#
# An explicit SPRING_DATASOURCE_URL always wins, so compose and local runs
# are unaffected.
if [ -z "${SPRING_DATASOURCE_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    rest=${DATABASE_URL#*://}
    case "$rest" in
        *@*) userinfo=${rest%%@*}; hostpath=${rest#*@} ;;
        *)   userinfo="";          hostpath=$rest ;;
    esac
    hostpath=${hostpath%%\?*}

    db_user=${userinfo%%:*}
    db_pass=${userinfo#*:}
    [ "$db_pass" = "$userinfo" ] && db_pass=""

    # reWriteBatchedInserts is what makes the 10,000-row seed take seconds
    # rather than minutes; see docs/performance.md.
    SPRING_DATASOURCE_URL="jdbc:postgresql://${hostpath}?reWriteBatchedInserts=true"
    export SPRING_DATASOURCE_URL
    [ -n "$db_user" ] && export SPRING_DATASOURCE_USERNAME="$db_user"
    [ -n "$db_pass" ] && export SPRING_DATASOURCE_PASSWORD="$db_pass"

    # Known limit: a percent-encoded password is passed through as written.
    # Managed providers generate alphanumeric passwords, but if yours does
    # not, set the three SPRING_DATASOURCE_* variables directly instead.
fi

# --- Web server -----------------------------------------------------------
PORT=${PORT:-8000}
sed "s/__PORT__/${PORT}/" /etc/nginx/nginx.conf.template > /etc/nginx/http.d/default.conf
nginx

# --- Application ----------------------------------------------------------
# A container memory limit is not a JVM heap limit. On a 512 MB instance the
# default heap sizing overcommits and the kernel kills the process partway
# through seeding, which looks like a deploy that simply never finishes.
exec java ${JAVA_OPTS:--XX:MaxRAMPercentage=70.0} -jar /app/app.jar
