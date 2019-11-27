import process from "process";
import { createAttributes, mergeAttributes } from "model-attributes";
import { Service } from "@kronos-integration/service";

const intervalOpposite = {
  opened: endpoint => {
    const o = endpoint.opposite;
    endpoint.receive(o.receive());

    const interval = setInterval(
      () => endpoint.receive(o.receive()),
      endpoint.owner[endpoint.name + "Interval"] * 1000
    );

    return () => clearInterval(interval);
  }
};

const intervalEndpointDefs = {
  cpu: {
    description: "cpu endpoint send interval (in seconds)",
    opposite: intervalOpposite,
    receive: () => process.cpuUsage()
  },
  memory: {
    description: "memory endpoint send interval (in seconds)",
    opposite: intervalOpposite,
    receive: () => process.memoryUsage()
  },
  uptime: {
    description: "uptime endpoint send interval (in seconds)",
    opposite: intervalOpposite,
    receive: () => process.uptime()
  }
};

/**
 * Collects health state form all components
 * Currently we only check that there are no service is in failed state
 */
export default class ServiceHealthCheck extends Service {
  /**
   * @return {string} 'health-check'
   */
  static get name() {
    return "health-check";
  }

  static get endpoints() {
    return {
      ...super.endpoints,
      state: {
        receive: "isHealthy",
        opposite: {
          opened: endpoint => {
            const hcs = endpoint.owner;
            endpoint.receive(hcs.isHealthy);
            const listener = () => endpoint.receive(hcs.isHealthy);
            hcs.addListener("serviceStateChanged", listener);
            return () => hcs.removeListener("serviceStateChanged", listener);
          }
        }
      },
      ...intervalEndpointDefs
    };
  }

  static get configurationAttributes() {
    return mergeAttributes(
      createAttributes(
        Object.entries(intervalEndpointDefs).reduce((all, [name, def]) => {
          all[name + "Interval"] = {
            description: def.description,
            default: 60,
            type: "duration"
          };
          return all;
        }, {})
      ),
      Service.configurationAttributes
    );
  }

  /**
   * Start immediate
   * @return {boolean} true
   */
  get autostart() {
    return true;
  }

  /**
   * @return {boolean} true if there are no failed services
   */
  get isHealthy() {
    return Object.values(this.owner.services).find(
      service => service.state === "failed"
    )
      ? false
      : true;
  }
}
