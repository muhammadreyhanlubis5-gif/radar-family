package com.radarfamily.client.model

data class RulesConfig(
    val blocked_domains: List<String>,
    val whitelisted_apps: List<String>,
    val upstream_dns: String
)
