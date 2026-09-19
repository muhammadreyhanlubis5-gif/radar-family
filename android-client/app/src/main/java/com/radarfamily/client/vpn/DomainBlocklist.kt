package com.radarfamily.client.vpn

import android.content.Context
import com.google.gson.Gson
import com.radarfamily.client.model.RulesConfig
import java.io.File
import java.io.FileReader

object DomainBlocklist {
    private val blockedDomains = hashSetOf<String>()
    private val whitelistedApps = mutableListOf<String>()
    private var upstreamDns = "1.1.1.3"
    private var context: Context? = null
    private val lock = Any()

    fun initialize(ctx: Context) {
        context = ctx.applicationContext
        reload()
    }

    fun reload() {
        synchronized(lock) {
            try {
                val file = File(context?.filesDir, "rules.json")
                if (file.exists()) {
                    val config = Gson().fromJson(FileReader(file), RulesConfig::class.java)
                    blockedDomains.clear()
                    blockedDomains.addAll(config.blocked_domains.map { it.lowercase() })
                    
                    whitelistedApps.clear()
                    whitelistedApps.addAll(config.whitelisted_apps)
                    
                    upstreamDns = config.upstream_dns
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun isBlocked(domain: String): Boolean {
        synchronized(lock) {
            var searchDomain = domain.lowercase()
            if (blockedDomains.contains(searchDomain)) return true
            
            while (searchDomain.contains(".")) {
                searchDomain = searchDomain.substring(searchDomain.indexOf(".") + 1)
                if (blockedDomains.contains(searchDomain)) return true
            }
            return false
        }
    }

    fun getWhitelistedApps(): List<String> = synchronized(lock) { whitelistedApps.toList() }

    fun getUpstreamDns(): String = synchronized(lock) { upstreamDns }

    fun getBlockedCount(): Int = synchronized(lock) { blockedDomains.size }
}
