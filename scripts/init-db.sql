-- Enable pgvector extension on primary application database
CREATE EXTENSION IF NOT EXISTS vector;

-- Dedicated benchmark database to isolate latency benchmarks from application/test data
CREATE DATABASE prahari_bench;
\c prahari_bench
CREATE EXTENSION IF NOT EXISTS vector;
