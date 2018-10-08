# homebridge-accessory-bandwidth-quality
An accessory plugin for [Homebridge](https://github.com/nfarina/homebridge).

# Installation
Run these commands:

    % sudo npm install -g homebridge
    % sudo npm install -g homebridge-accessory-bandwidth-quality

On Linux, you might see this output for the second command:

    npm ERR! pcap@2.0.0 install: node-gyp rebuild
    npm ERR! Exit status 1
    npm ERR!

If so, please try

    % apt-get install libpcap-dev

and try

    % sudo npm install -g homebridge-accessory-bandwidth-quality

again!

NB: If you install homebridge like this:

    sudo npm install -g --unsafe-perm homebridge

Then all subsequent installations must be like this:

    sudo npm install -g --unsafe-perm homebridge-accessory-bandwidth-quality

# Configuration
Edit `~/.homebridge/config.json`, inside `"accessories": [ ... ]` add:

    { "accessory" : "bandwidth-quality"
    , "name"      : "Bandwidth Quality"
    , "token"     : "..."
    // choices are in bits (bps, Kbps, Mbps, or Gbps) or octets (Bps, KBps, MBps, GBps)
    , "nominal"   : { units: "Mbps", value: 300 }

    // optional, here are the defaults
    // default TTL is 30m, minimum TTL is 5m
    , "options"   : { "ttl": 1800 }
    }

Please read [this](https://github.com/branchard/fast-speedtest-api#how-to-get-app-token-) to determine the value of the `token` parameter.

# Many Thanks
Many thanks to [branchard](https://github.com/branchard) author of [fast-speedtest-api](https://github.com/branchard/fast-speedtest-api).

Many thanks (also) to [SeydX](https://github.com/SeydX) author of [homebridge-bandwidth](https://github.com/SeydX/homebridge-broadband).
