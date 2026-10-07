package com.sistema.erp.isolamento;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.hibernate.cfg.AvailableSettings;
import org.hibernate.engine.jdbc.connections.spi.MultiTenantConnectionProvider;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.stereotype.Component;

/**
 * Informa ao PostgreSQL a empresa atual em cada conexão entregue ao Hibernate, para
 * que as políticas de Row Level Security filtrem por ela. A variável é apagada antes
 * de a conexão voltar ao pool, de modo que nenhuma empresa "vaze" para o próximo uso.
 */
@Component
public class ConexaoPorEmpresa implements MultiTenantConnectionProvider<UUID>, HibernatePropertiesCustomizer {

	private final DataSource fonteDeDados;

	public ConexaoPorEmpresa(DataSource fonteDeDados) {
		this.fonteDeDados = fonteDeDados;
	}

	@Override
	public Connection getAnyConnection() throws SQLException {
		return fonteDeDados.getConnection();
	}

	@Override
	public void releaseAnyConnection(Connection conexao) throws SQLException {
		conexao.close();
	}

	@Override
	public Connection getConnection(UUID empresaId) throws SQLException {
		Connection conexao = fonteDeDados.getConnection();
		try (PreparedStatement comando = conexao.prepareStatement("SELECT set_config('app.empresa_id', ?, false)")) {
			comando.setString(1, empresaId.toString());
			comando.execute();
			confirmar(conexao);
			return conexao;
		}
		catch (SQLException | RuntimeException erro) {
			conexao.close();
			throw erro;
		}
	}

	@Override
	public void releaseConnection(UUID empresaId, Connection conexao) throws SQLException {
		try (Statement comando = conexao.createStatement()) {
			comando.execute("RESET app.empresa_id");
			confirmar(conexao);
		}
		finally {
			conexao.close();
		}
	}

	// Fora do modo autocommit, sem confirmar o pool desfaria o comando ao receber a conexão de volta.
	private static void confirmar(Connection conexao) throws SQLException {
		if (!conexao.getAutoCommit()) {
			conexao.commit();
		}
	}

	@Override
	public boolean supportsAggressiveRelease() {
		return false;
	}

	@Override
	public boolean isUnwrappableAs(Class<?> tipo) {
		return tipo.isInstance(this);
	}

	@Override
	public <T> T unwrap(Class<T> tipo) {
		return tipo.cast(this);
	}

	@Override
	public void customize(Map<String, Object> propriedades) {
		propriedades.put(AvailableSettings.MULTI_TENANT_CONNECTION_PROVIDER, this);
	}

}
