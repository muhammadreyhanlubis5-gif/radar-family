package com.radarfamily.client

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.VpnService
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.radarfamily.client.vpn.DnsSinkholeService
import com.radarfamily.client.vpn.DomainBlocklist
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var toggleButton: Button
    private lateinit var statusText: TextView
    private lateinit var subtitleText: TextView
    private lateinit var statsDomains: TextView
    private lateinit var statsApps: TextView
    private lateinit var whitelistAppsList: TextView
    private lateinit var lastUpdateText: TextView
    
    private var isVpnActive = false

    private val vpnServiceResult = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK) {
            startVpnService()
        }
    }

    private val vpnStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.radarfamily.client.VPN_STATE") {
                isVpnActive = intent.getBooleanExtra("active", false)
                updateUI()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        toggleButton = findViewById(R.id.toggleButton)
        statusText = findViewById(R.id.statusText)
        subtitleText = findViewById(R.id.subtitleText)
        statsDomains = findViewById(R.id.statsDomains)
        statsApps = findViewById(R.id.statsApps)
        whitelistAppsList = findViewById(R.id.whitelistAppsList)
        lastUpdateText = findViewById(R.id.lastUpdateText)

        copyDefaultRulesIfMissing()
        DomainBlocklist.initialize(this)
        
        toggleButton.setOnClickListener {
            if (isVpnActive) {
                stopVpnService()
            } else {
                prepareVpn()
            }
        }

        updateStats()
    }

    override fun onResume() {
        super.onResume()
        registerReceiver(vpnStateReceiver, IntentFilter("com.radarfamily.client.VPN_STATE"), RECEIVER_NOT_EXPORTED)
        updateStats()
    }

    override fun onPause() {
        super.onPause()
        unregisterReceiver(vpnStateReceiver)
    }

    private fun prepareVpn() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnServiceResult.launch(intent)
        } else {
            startVpnService()
        }
    }

    private fun startVpnService() {
        val intent = Intent(this, DnsSinkholeService::class.java).apply {
            action = DnsSinkholeService.ACTION_START
        }
        startService(intent)
        isVpnActive = true
        updateUI()
    }

    private fun stopVpnService() {
        val intent = Intent(this, DnsSinkholeService::class.java).apply {
            action = DnsSinkholeService.ACTION_STOP
        }
        startService(intent)
        isVpnActive = false
        updateUI()
    }

    private fun updateUI() {
        if (isVpnActive) {
            statusText.text = "Protected"
            statusText.setTextColor(0xFF4CAF50.toInt())
            toggleButton.text = "DEACTIVATE"
            toggleButton.backgroundTintList = android.content.res.ColorStateList.valueOf(0xFF4CAF50.toInt())
        } else {
            statusText.text = "Unprotected"
            statusText.setTextColor(0xFFFFFFFF.toInt())
            toggleButton.text = "ACTIVATE"
            toggleButton.backgroundTintList = android.content.res.ColorStateList.valueOf(0xFF444444.toInt())
        }
    }

    private fun updateStats() {
        val blockedCount = DomainBlocklist.getBlockedCount()
        subtitleText.text = "Blocked: ${blockedCount} domains"
        statsDomains.text = blockedCount.toString()
        val apps = DomainBlocklist.getWhitelistedApps()
        statsApps.text = apps.size.toString()
        whitelistAppsList.text = apps.joinToString("\n")
        
        val rulesFile = File(filesDir, "rules.json")
        if (rulesFile.exists()) {
            val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
            lastUpdateText.text = "Last updated: ${sdf.format(Date(rulesFile.lastModified()))}"
        }
    }

    private fun copyDefaultRulesIfMissing() {
        val rulesFile = File(filesDir, "rules.json")
        if (!rulesFile.exists()) {
            try {
                val defaultJson = """
                    {
                        "blocked_domains": ["ads.example.com", "malware.com"],
                        "whitelisted_apps": ["com.android.chrome"],
                        "upstream_dns": "1.1.1.3"
                    }
                """.trimIndent()
                FileOutputStream(rulesFile).use { it.write(defaultJson.toByteArray()) }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
