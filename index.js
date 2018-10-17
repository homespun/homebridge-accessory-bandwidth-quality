/* jshint asi: true, esversion: 6, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

const FastSpeedtest = require('fast-speedtest-api')
  , NodeCache     = require('node-cache')
  , debug         = require('debug')('bandwidth-quality')
  , moment        = require('moment')
  , os            = require('os')
  , underscore    = require('underscore')


module.exports = function (homebridge) {
  const Characteristic = homebridge.hap.Characteristic
      , Service = homebridge.hap.Service
      , qualities = { excellent: 0.90, good: 0.75, fair: 0.67, inferior: 0.50 }
      , units = [ 'bps', 'Kbps', 'Mbps', 'Gbps', 'Bps', 'KBps', 'MBps', 'GBps' ]
      , qual2ppm = underscore.invert(
        {  500: Characteristic.AirQuality.EXCELLENT
        ,  750: Characteristic.AirQuality.GOOD
        , 1000: Characteristic.AirQuality.FAIR
        , 1250: Characteristic.AirQuality.INFERIOR
        , 1750: Characteristic.AirQuality.POOR
        })

  homebridge.registerAccessory("homebridge-accessory-bandwidth-quality", "bandwidth-quality", BandwidthQuality)

  function BandwidthQuality(log, config) {
    if (!(this instanceof BandwidthQuality)) return new BandwidthQuality(log, config)

    let nominal, oopsP, quality

    this.log = log
    this.config = config
    if (!(this.config.nominal && this.config.token)) throw new Error('Missing configuration')

    nominal = this.config.nominal
    if (typeof nominal === 'number') nominal = { download: { unit: 'Mbps', value: nominal } }
    else if (nominal.unit) nominal = { download: nominal }
    oopsP = !nominal.download
    underscore.keys(nominal).forEach((key) => {
      const pair = nominal[key]

      oopsP |= (units.indexOf(pair.unit) === -1) || (!Number.isInteger(pair.value)) || (pair.value <= 0)
    })
    this.config.nominal = nominal

    quality = this.config.quality || qualities
    
    underscore.keys(quality).forEach((key) => {
      oopsP |= (isNaN(parseFloat(quality[key]))) || (quality[key] <= 0.0) || (quality[key] > 1.0)
    })
    oopsP |= (quality.excellent <= quality.good) || (quality.good <= quality.fair) || (quality.fair <= quality.inferior)
    this.config.quality = quality
    
    debug('config', this.config)
    if (oopsP) throw new Error('Invalid configuration')

    this.name = this.config.name
    this.options = underscore.defaults(this.config.options || {}, { ttl: 1800, verbose: false })
    if (this.options < 300) this.options.ttl = 1800
    debug('options', this.options)

    this.speedtest = new FastSpeedtest({ token: this.config.token, verbose: this.options.verbose })
    this.cache = new NodeCache({ stdTTL: this.options.ttl })
    this.statusFault = Characteristic.StatusFault.NO_FAULT
  }

  BandwidthQuality.prototype =
  { fetchQuality: function (callback) {
      const self = this

      self._fetchQuality((err, result) => {
        self.statusFault = (err || (!result)) ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT

        if (callback) callback(err, result)
      })
    }

  , _fetchQuality: function (callback) {
      const self = this
      
      self.cache.get('bandwidth-quality', (err, result) => {
        if (err) return callback(err)

        if (result) return callback(null, result)

        self.speedtest.getSpeed().then((result) => {
          let download, nominal, quality

          if (!result) return callback()

          download = FastSpeedtest.UNITS[self.config.nominal.download.unit](result)
          nominal = self.config.nominal.download.value
          quality = download >= Math.round(nominal * self.config.quality.excellent) ? Characteristic.AirQuality.EXCELLENT
                  : download >= Math.round(nominal * self.config.quality.good)      ? Characteristic.AirQuality.GOOD
                  : download >= Math.round(nominal * self.config.quality.fair)      ? Characteristic.AirQuality.FAIR
                  : download >= Math.round(nominal * self.config.quality.inferior)  ? Characteristic.AirQuality.INFERIOR
                  :                                                                   Characteristic.AirQuality.POOR
          debug('getSpeed', { result, download, nominal, quality })

          result = { quality, download: download }
          self.cache.set('bandwidth-quality', result)

          // it would be nice to use the actual labels, but this is a limitation of the Elgato Eve application...
          const entry = {
            time: moment().unix(),
            ppm: parseFloat(qual2ppm[quality]),
            temp: download,
            humidity: (1.0 - (download / nominal)) * 100
          }
          
          debug('history', entry)
          self.historyService.addEntry(entry)

          callback(null, result)
        }).catch((err) => {
          self.log.error('FastSpeedtest error: ' + err.toString())
          return callback(err)
        })
      })
    }

  , getAirQuality: function (callback) {
      this.fetchQuality((err, result) => {
        if (err) return callback(err)

        callback(null, result ? result.quality : Characteristic.AirQuality.UNKNOWN)
      })
    }

  , getStatusFault: function (callback) {
      callback(null, this.statusFault)
    }

  , getDownloadSpeed: function (callback) {
      const self = this
      
      self.fetchQuality((err, result) => {
        if (err) return callback(err)

        if (!(result && result.download)) return callback()

        callback(null, result.download)
      })
    }

  , getServices: function () {
      const CommunityTypes = require('hap-nodejs-community-types')(homebridge, {
        units: { DownloadSpeed: this.config.nominal.download.unit }
      })
      const FakeGatoHistoryService = require('fakegato-history')(homebridge)
    
      require('pkginfo')(module, [ 'name', 'author', 'version' ])

      this.qualityService = new Service.AirQualitySensor('Bandwidth Quality')

      this.qualityService.addCharacteristic(CommunityTypes.DownloadSpeed)

      this.informationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Identify, module.exports.name)
        .setCharacteristic(Characteristic.Manufacturer, module.exports.author.name)
        .setCharacteristic(Characteristic.Model, "Bandwidth Quality Monitor")
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.SerialNumber, '1539641092069')
        .setCharacteristic(Characteristic.FirmwareRevision, module.exports.version)

      this.qualityService
        .getCharacteristic(Characteristic.AirQuality)
        .on('get', this.getAirQuality.bind(this))

      this.qualityService
        .getCharacteristic(Characteristic.StatusFault)
        .on('get', this.getStatusFault.bind(this))

      this.qualityService
        .getCharacteristic(CommunityTypes.DownloadSpeed)
        .on('get', this.getDownloadSpeed.bind(this))

      this.displayName = this.name
      this.historyService = new FakeGatoHistoryService('room', this, {
        storage: 'fs',
        disableTimer: true,
        path: homebridge.user.cachedAccessoryPath(),
        filename: os.hostname().split(".")[0] + '_bandwidth-quality_persist.json'
      })

      setTimeout(this.fetchQuality.bind(this), 1 * 1000)
      setInterval(this.fetchQuality.bind(this), 15 * 60 * 1000)

      return [ this.informationService, this.qualityService, this.historyService ]
    }
  }
}
