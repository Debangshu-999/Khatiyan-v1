package com.khatiyan.support;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import javax.sql.DataSource;

import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * Counts the SQL statements a piece of code runs.
 *
 * <p><b>Why it exists.</b> A query per row (N+1) is invisible on a small
 * database: with five rooms, 1 + 10 queries is as fast as 2. It showed only
 * when a 150-bed property was seeded, as 150 queries behind one room list
 * (2026-10-02). After launch it would have shown as a slow Home screen for the
 * largest customers first.
 *
 * <p><b>How to use it.</b> Run the same call against a small set of rows and a
 * large one, and require the same count:
 *
 * <pre>
 * long few = QueryCount.of(() -&gt; service.list(smallProperty));
 * long many = QueryCount.of(() -&gt; service.list(largeProperty));
 * assertThat(many).isEqualTo(few);
 * </pre>
 *
 * A count that grows with the rows is a query per row. Every new list, summary
 * or report query gets a line in {@code QueriesDoNotGrowWithRowsTest}.
 *
 * <p>Counts only the calling thread, so background listeners do not add noise.
 * Wired into every {@code @IntegrationTest} through {@link Wiring}.
 */
public final class QueryCount {

    private static final ThreadLocal<long[]> COUNTER = new ThreadLocal<>();

    private QueryCount() {
    }

    /** How many SQL statements {@code call} ran on this thread. */
    public static long of(Runnable call) {
        long[] count = new long[1];
        COUNTER.set(count);
        try {
            call.run();
        } finally {
            COUNTER.remove();
        }
        return count[0];
    }

    private static void record() {
        long[] count = COUNTER.get();
        if (count != null) {
            count[0]++;
        }
    }

    /** Puts a counting wrapper round the application's DataSource. */
    @TestConfiguration(proxyBeanMethods = false)
    public static class Wiring {

        @Bean
        static BeanPostProcessor statementCountingDataSource() {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(Object bean, String beanName) {
                    return bean instanceof DataSource dataSource && !(bean instanceof CountingDataSource)
                            ? new CountingDataSource(dataSource)
                            : bean;
                }
            };
        }
    }

    private static final class CountingDataSource extends DelegatingDataSource {

        CountingDataSource(DataSource target) {
            super(target);
        }

        @Override
        public Connection getConnection() throws SQLException {
            return counting(super.getConnection());
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            return counting(super.getConnection(username, password));
        }
    }

    /** A prepared statement is counted when it is prepared: Hibernate and JdbcTemplate prepare one per execution. */
    private static Connection counting(Connection target) {
        return (Connection) Proxy.newProxyInstance(
                QueryCount.class.getClassLoader(),
                new Class<?>[] { Connection.class },
                (proxy, method, args) -> {
                    String name = method.getName();
                    if (name.equals("prepareStatement") || name.equals("prepareCall")) {
                        record();
                    }
                    Object result = invoke(target, method, args);
                    return name.equals("createStatement") ? counting((Statement) result) : result;
                });
    }

    /** A plain statement has no SQL until it runs, so it is counted when it executes. */
    private static Statement counting(Statement target) {
        return (Statement) Proxy.newProxyInstance(
                QueryCount.class.getClassLoader(),
                new Class<?>[] { Statement.class },
                (proxy, method, args) -> {
                    if (method.getName().startsWith("execute") && args != null && args.length > 0) {
                        record();
                    }
                    return invoke(target, method, args);
                });
    }

    private static Object invoke(Object target, java.lang.reflect.Method method, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException failure) {
            throw failure.getCause();
        }
    }
}
