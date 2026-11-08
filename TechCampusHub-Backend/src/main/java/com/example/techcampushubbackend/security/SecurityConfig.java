package com.example.techcampushubbackend.security;

import com.example.techcampushubbackend.config.AppProperties;
import com.example.techcampushubbackend.dto.ErrorResponse;
import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Stateless JWT security: no sessions, BCrypt password hashing, role-based
 * authorization (ADMIN / STUDENT) and JSON 401/403 responses.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Swagger / OpenAPI docs
                        .requestMatchers("/", "/error",
                                "/swagger-ui.html", "/swagger-ui/**",
                                "/v3/api-docs/**", "/webjars/**").permitAll()
                        // Public catalog: browse courses without logging in
                        .requestMatchers(HttpMethod.GET, "/api/courses/**").permitAll()
                        // Public site settings (UPI id, Telegram invite, chatbot link)
                        .requestMatchers(HttpMethod.GET, "/api/settings").permitAll()
                        // Public platform rating shown on the homepage
                        .requestMatchers(HttpMethod.GET, "/api/ratings/**").permitAll()
                        // Public homepage previews (metadata only - never file URLs)
                        .requestMatchers(HttpMethod.GET, "/api/public/**").permitAll()
                        // Authentication endpoints
                        .requestMatchers("/api/auth/**").permitAll()
                        // Everything under /api/admin requires the ADMIN role
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Faculty workspace: FACULTY or ADMIN only - students can never
                        // reach it (mirrors @PreAuthorize on FacultyController: defense in depth)
                        .requestMatchers("/api/faculty/**").hasAnyRole("ADMIN", "FACULTY")
                        // Health check
                        .requestMatchers("/api/health").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                writeJson(request, response, HttpServletResponse.SC_UNAUTHORIZED,
                                        "Unauthorized", messageFor(authException)))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                writeJson(request, response, HttpServletResponse.SC_FORBIDDEN,
                                        "Forbidden", "You do not have permission to access this resource")))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private static String messageFor(Exception ex) {
        return ex != null && ex.getMessage() != null
                ? ex.getMessage()
                : "Authentication required";
    }

    private void writeJson(jakarta.servlet.http.HttpServletRequest request,
                           HttpServletResponse response, int status, String error, String message)
            throws java.io.IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(),
                ErrorResponse.of(status, error, message, request.getRequestURI()));
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(appProperties.getCors().getAllowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "X-Requested-With"));
        configuration.setExposedHeaders(List.of("Location"));
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
