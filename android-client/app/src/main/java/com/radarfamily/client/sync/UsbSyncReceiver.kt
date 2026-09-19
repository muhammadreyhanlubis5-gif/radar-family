package com.radarfamily.client.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbManager
import android.util.Log
import com.radarfamily.client.vpn.DomainBlocklist

class UsbSyncReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) {
            Log.d("UsbSyncReceiver", "USB Device attached. Checking for new rules...")
            DomainBlocklist.reload()
        }
    }
}
