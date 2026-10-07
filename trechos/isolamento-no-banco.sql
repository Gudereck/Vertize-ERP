-- Trecho da migração inicial (V1__base.sql): como o banco isola os dados de cada lojista.
-- O arquivo completo cria também as tabelas de usuário, vínculo usuário-loja e sessão,
-- todas com a mesma política.

GRANT USAGE ON SCHEMA public TO ${usuario_app};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${usuario_app};

-- Empresa da requisição atual, informada pela aplicação a cada conexão.
-- Sem empresa definida o resultado é NULL e nenhuma linha passa pelas políticas.
CREATE FUNCTION app_empresa_id() RETURNS uuid
    LANGUAGE sql STABLE
AS $$
    SELECT nullif(current_setting('app.empresa_id', true), '')::uuid
$$;

CREATE TABLE loja (
    id            uuid PRIMARY KEY,
    empresa_id    uuid         NOT NULL REFERENCES empresa (id),
    nome          varchar(120) NOT NULL,
    cnpj          varchar(14),
    ativa         boolean      NOT NULL DEFAULT true,
    versao        bigint       NOT NULL DEFAULT 0,
    criado_em     timestamptz  NOT NULL DEFAULT now(),
    atualizado_em timestamptz  NOT NULL DEFAULT now(),
    -- Alvo das chaves estrangeiras compostas, que impedem ligar registros de empresas diferentes.
    CONSTRAINT loja_empresa_id_unico UNIQUE (empresa_id, id),
    CONSTRAINT loja_nome_unico UNIQUE (empresa_id, nome),
    CONSTRAINT loja_cnpj_formato CHECK (cnpj IS NULL OR cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$')
);

ALTER TABLE loja ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolamento_empresa ON loja
    USING (empresa_id = app_empresa_id())
    WITH CHECK (empresa_id = app_empresa_id());

-- No login ainda não se sabe a empresa do usuário, e as políticas acima escondem
-- todos os usuários. Esta função roda com os privilégios do dono das tabelas e
-- devolve apenas a empresa do e-mail informado, nada além disso.
CREATE FUNCTION auth_empresa_do_email(p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp
AS $$
    SELECT empresa_id FROM usuario WHERE email = lower(p_email)
$$;

REVOKE ALL ON FUNCTION auth_empresa_do_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_empresa_do_email(text) TO ${usuario_app};
