#!/bin/sh
# Executado apenas na PRIMEIRA inicialização do volume do PostgreSQL.
# Cria um usuário e um banco separados para o sistema e para a Evolution API (menor privilégio).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE central LOGIN PASSWORD '${CENTRAL_DB_PASSWORD}';
CREATE DATABASE central OWNER central;
CREATE ROLE evolution LOGIN PASSWORD '${EVOLUTION_DB_PASSWORD}';
CREATE DATABASE evolution OWNER evolution;
SQL
